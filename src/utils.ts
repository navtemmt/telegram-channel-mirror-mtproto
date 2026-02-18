// FIXED: DC migrate handling in sendCode
export async function getUser() {
  try {
    const user = await global.api.call('users.getFullUser', {
      id: { _: 'inputUserSelf' },
    })
    return user
  } catch (error) {
    return null
  }
}

export async function sendCode(phone) {
  try {
    return await global.api.call('auth.sendCode', {
      phone_number: phone,
      settings: { _: 'codeSettings' },
    })
  } catch (error) {
    if (error.error_message === 'PHONE_MIGRATE_5') {
      console.log('🔄 sendCode: Auto-migrating to DC 5...')
      await global.api.setDefaultDc(5)
      await global.api.storage.set({ currentDcId: 5 })
      return await global.api.call('auth.sendCode', {
        phone_number: phone,
        settings: { _: 'codeSettings' },
      })
    }
    throw error
  }
}

export function signIn({ code, phone, phone_code_hash }) {
  return global.api.call('auth.signIn', {
    phone_code: code,
    phone_number: phone,
    phone_code_hash: phone_code_hash,
  })
}

export function signUp({ phone, phone_code_hash }) {
  return global.api.call('auth.signUp', {
    phone_number: phone,
    phone_code_hash: phone_code_hash,
    first_name: 'MTProto',
    last_name: 'Core',
  })
}

export function getPassword() {
  return global.api.call('account.getPassword')
}

export function checkPassword({ srp_id, A, M1 }) {
  return global.api.call('auth.checkPassword', {
    password: {
      _: 'inputCheckPasswordSRP',
      srp_id,
      A,
      M1,
    },
  })
}

export function mtprotoEntitiesToBotAPI(mtprotoEntities) {
  return mtprotoEntities.map(mtprotoEntity => {
    let entity = {}
    switch (mtprotoEntity['_']) {
      case 'messageEntityBold':
        entity = { type: 'bold' }
        break
      case 'messageEntityTextUrl':
        entity = { type: 'text_link', url: mtprotoEntity['url'] }
        break
      case 'messageEntityUrl':
        entity = { type: 'url' }
        break
      case 'messageEntityItalic':
        entity = { type: 'italic' }
        break
      case 'messageEntityUnderline':
        entity = { type: 'underline' }
        break
      case 'messageEntityCode':
        entity = { type: 'code' }
        break
      case 'messageEntityPre':
        entity = { type: 'pre', language: mtprotoEntity['language'] }
        break
      case 'messageEntityStrike':
        entity = { type: 'strikethrough' }
        break
      case 'messageEntityBlockquote':
        entity = { type: 'code' }
        break
      case 'messageEntitySpoiler':
        entity = { type: 'spoiler' }
        break
      default:
        return null
    }
    return { ...entity, offset: mtprotoEntity['offset'], length: mtprotoEntity['length'] }
  }).filter(Boolean)
}
