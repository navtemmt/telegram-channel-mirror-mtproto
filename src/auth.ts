// FIXED: Skip getUser() pre-auth, force DC via index.ts
import readlineSync from 'readline-sync'
import { sendCode, signIn, getPassword, checkPassword } from './utils.js'

export default async function authorize() {
  if (process.argv[2] === '--logout') {
    await global.api.storage.removeAll()
    console.log('Logged out successfully.')
    process.exit(0)
  }

  const phone = process.env.PHONE || readlineSync.question('Enter phone (+60xxxxxxxxx): ')
  
  console.log('Sending verification code...')
  const { phone_code_hash } = await sendCode(phone)
  
  const code = readlineSync.question('Enter verification code: ')
  
  try {
    await signIn({
      phone,
      phone_code_hash,
      code
    })
  } catch (error) {
    switch (error.error_message) {
      case 'SESSION_PASSWORD_NEEDED':
        try {
          const { srp_id, current_algo, srp_B } = await getPassword()
          const { g, p, salt1, salt2 } = current_algo
          const { A, M1 } = await global.api.crypto.getSRPParams({
            g, p, salt1, salt2, gB: srp_B,
            password: process.env.TWO_FA_PASSWORD || readlineSync.question('Enter 2FA password: ')
          })
          await checkPassword({ srp_id, A, M1 })
        } catch (e) {
          if (e.error_message === 'PASSWORD_HASH_INVALID') {
            console.log('Wrong 2FA password!')
            return await authorize()
          }
          throw e
        }
        break
      case 'PHONE_CODE_INVALID':
        console.log('Invalid code! Retrying...')
        return await authorize()
      default:
        throw error
    }
  }
  
  // Now safe: get user post-auth
  const { users } = await global.api.call('users.getUsers', [{ _: 'inputUserSelf' }])
  return { users }
}
