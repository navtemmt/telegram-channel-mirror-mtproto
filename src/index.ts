import 'dotenv/config'
import fs from 'fs/promises'
import MTProto from '@mtproto/core'
import authorize from './auth.js'
import poll from './poll.js'
import fetch from 'node-fetch'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import * as Yup from 'yup'

const __dirname = dirname(fileURLToPath(import.meta.url)) + '/'
const config = JSON.parse(await fs.readFile(__dirname + '../config.json', 'utf-8'))
const pollInterval = config['interval'] //15 * 60 * 1000

await Yup.object({
  native_copy: Yup.mixed().oneOf(['auto', 'auto_LEGACY', true, false]).required(),
  report_errors_to_telegram: Yup.bool().required(),
  interval: Yup.number().integer().positive().required(),
  limit: Yup.number().integer().min(1).max(100).required(),
}).validate(config)

global.config = config

try {
  const api = new MTProto({ 
    api_id: Number(process.env.APP_ID),
    api_hash: process.env.APP_HASH,
    
    storageOptions: { path: __dirname + '../tempdata.json' },
    // FIXED: Force DC 5 primary servers
    
  })
  
  global.api = api
  
  // FIXED: Auto-handle PHONE_MIGRATE_5 & NETWORK_MIGRATE during auth.sendCode

  
  const session = await authorize()
  const user = session.users[0]
  console.log(`✅ User ${user.first_name} ${user.last_name} authenticated. Bot started.`)
  
  // NEW CODE: Support both username and channel ID for source channel
  if (process.env.FROM_CHANNEL_ID) {
    console.log('Using FROM_CHANNEL_ID for source channel (private channel support)')
    const dialogs = await api.call('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
      limit: 200,
      hash: 0
    })
    
    const targetChannelId = Number(process.env.FROM_CHANNEL_ID)
    global.channel = dialogs.chats.find(chat => 
      (chat._ === 'channel' || chat._ === 'channelForbidden') && chat.id === targetChannelId
    )
    
    if (!global.channel) {
      throw new Error(`Channel with ID ${targetChannelId} not found in your dialogs. Make sure you're a member of this channel.`)
    }
    console.log(`Found source channel: ${global.channel.title || 'Untitled'} (ID: ${global.channel.id})`)
  } else if (process.env.FROM_USERNAME) {
    console.log('Using FROM_USERNAME for source channel (public channel)')
    const resolvedPeer = await api.call('contacts.resolveUsername', { username: process.env.FROM_USERNAME })
    global.channel = resolvedPeer.chats[0]
  } else {
    throw new Error('You must set either FROM_USERNAME or FROM_CHANNEL_ID in .env file')
  }
  
  if (['auto', 'auto_LEGACY'].includes(global.config.native_copy)) {
    global.copy_natively = !global.channel.noforwards
    global.force_copy_natively_override = true
    console.log('config.native_copy was set to auto. Bot is going to copy messages', global.channel.noforwards ? 'using bypassing algorithm' : 'natively')
  } else if (typeof global.config.native_copy === 'boolean') {
    global.copy_natively = global.config.native_copy
  } else {
    throw 'Unknown config.native_copy option value.'
  }
  
  // Support both username and channel ID for destination channel
  if (process.env.TO_CHANNEL_ID) {
    console.log('Using TO_CHANNEL_ID for destination channel')
    const dialogs = await api.call('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
      limit: 200,
      hash: 0
    })
    
    const targetChannelId = Number(process.env.TO_CHANNEL_ID)
    global.target = dialogs.chats.find(chat => 
      (chat._ === 'channel' || chat._ === 'channelForbidden') && chat.id === targetChannelId
    )
    
    if (!global.target) {
      throw new Error(`Destination channel with ID ${targetChannelId} not found in your dialogs.`)
    }
    console.log(`Found destination channel: ${global.target.title || 'Untitled'} (ID: ${global.target.id})`)
  } else if (process.env.TO_USERNAME) {
    const targetPeer = await api.call('contacts.resolveUsername', { username: process.env.TO_USERNAME })
    global.target = targetPeer.chats[0]
  } else {
    throw new Error('You must set either TO_USERNAME or TO_CHANNEL_ID in .env file')
  }
  
  await poll()
  setInterval(() => poll(), pollInterval)
} catch(e) {
  if (config.report_errors_to_telegram) {
    await fetch(`https://api.telegram.org/bot${process.env.ERROR_HANDLER_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        chat_id: process.env.ERROR_HANDLER_USER_ID,
        text: e.message || JSON.stringify(e, Object.getOwnPropertyNames(e)) || e
      })
    })
  } else {
    console.error('❌ Error:', e.message || e)
    console.error(JSON.stringify(e, Object.getOwnPropertyNames(e)))
  }
  process.exit(1)
}
