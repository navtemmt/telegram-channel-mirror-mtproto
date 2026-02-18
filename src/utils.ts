// Source: https://gist.github.com/VityaSchel/77e482daf2ac688c18d39b126583fc86

/**
 * Safe MTProto call wrapper
 * Handles:
 *  - PHONE_MIGRATE_X
 *  - NETWORK_MIGRATE_X
 *  - USER_MIGRATE_X
 *  - FILE_MIGRATE_X
 *
 * Automatically switches DC and retries once.
 */
async function safeCall(method: string, params: any = {}) {
  try {
    return await global.api.call(method, params)
  } catch (error: any) {
    const msg = error?.error_message || ''

    const migrateMatch = msg.match(
      /^(PHONE|NETWORK|USER|FILE)_MIGRATE_(\d+)$/i
    )

    if (migrateMatch) {
      const dcId = Number(migrateMatch[2])

      console.log(`🔄 MTProto migration detected → DC ${dcId} (${msg})`)

      // switch default DC
      await global.api.setDefaultDc(dcId)

      // retry the same request once
      return await global.api.call(method, params)
    }

    throw error
  }
}

export async function getUser() {
  try {
    const user = await safeCall('users.getFullUser', {
      id: {
        _: 'inputUserSelf',
      },
    })

    return user
  } catch (error) {
    return null
  }
}

function getPhoneOrThrow(explicitPhone?: string): string {
  const phoneNumber = explicitPhone || process.env.PHONE_NUMBER
  if (!phoneNumber) {
    throw new Error(
      'PHONE_NUMBER is not set in .env and no phone argument was provided'
    )
  }
  return phoneNumber
}

export function sendCode(phone?: string) {
  const phoneNumber = getPhoneOrThrow(phone)

  return safeCall('invokeWithLayer', {
    layer: 181, // current safe MTProto layer
    query: {
      _: 'initConnection',

      api_id: Number(process.env.APP_ID),

      device_model: 'NodeJS',
      system_version: process.version,
      app_version: '1.0.0',
      system_lang_code: 'en',
      lang_pack: '',
      lang_code: 'en',

      query: {
        _: 'auth.sendCode',
        phone_number: phoneNumber,
        settings: {
          _: 'codeSettings',
        },
      },
    },
  })
}

export function signIn({
  code,
  phone,
  phone_code_hash,
}: {
  code: string
  phone?: string
  phone_code_hash: string
}) {
  const phoneNumber = getPhoneOrThrow(phone)

  return safeCall('auth.signIn', {
    phone_code: code,
    phone_number: phoneNumber,
    phone_code_hash,
  })
}

export function signUp({
  phone,
  phone_code_hash,
}: {
  phone?: string
  phone_code_hash: string
}) {
  const phoneNumber = getPhoneOrThrow(phone)

  return safeCall('auth.signUp', {
    phone_number: phoneNumber,
    phone_code_hash,
    first_name: 'MTProto',
    last_name: 'Core',
  })
}

export function getPassword() {
  return safeCall('account.getPassword')
}

export function checkPassword({
  srp_id,
  A,
  M1,
}: {
  srp_id: any
  A: any
  M1: any
}) {
  return safeCall('auth.checkPassword', {
    password: {
      _: 'inputCheckPasswordSRP',
      srp_id,
      A,
      M1,
    },
  })
}

export function mtprotoEntitiesToBotAPI(mtprotoEntities: object[]): object[] {
  return mtprotoEntities
    .map((mtprotoEntity: any) => {
      let entity: any = {}

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

      return {
        ...entity,
        offset: mtprotoEntity['offset'],
        length: mtprotoEntity['length'],
      }
    })
    .filter(Boolean)
}
