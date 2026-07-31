import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  createLarkAgendaLoader,
  dateRange,
  normalizeAgendaEvent,
} = require('../src/main/lark-agenda.js')

function verifiedUserPayload() {
  return {
    identity: 'user',
    verified: true,
    identities: {
      user: {
        status: 'ready',
        openId: 'ou_current_user',
      },
    },
  }
}

test('Lark agenda loader verifies user identity and returns sorted upcoming events', async () => {
  const calls = []
  const loader = createLarkAgendaLoader({
    now: () => new Date('2026-07-31T08:00:00+08:00'),
    runJson: async (_command, args) => {
      calls.push(args)
      if (args[0] === 'auth') return verifiedUserPayload()
      return {
        ok: true,
        identity: 'user',
        data: [
          {
            event_id: 'event-late',
            summary: '下午评审',
            start_time: { datetime: '2026-07-31T15:00:00+08:00', timezone: 'Asia/Shanghai' },
            end_time: { datetime: '2026-07-31T16:00:00+08:00', timezone: 'Asia/Shanghai' },
            self_rsvp_status: 'accept',
          },
          {
            event_id: 'event-early',
            summary: '上午周会',
            start_time: { datetime: '2026-07-31T10:00:00+08:00', timezone: 'Asia/Shanghai' },
            end_time: { datetime: '2026-07-31T11:00:00+08:00', timezone: 'Asia/Shanghai' },
            app_link: 'https://applink.larkoffice.com/client/calendar/event/detail?key=event-early',
            event_organizer: { display_name: '同事' },
          },
        ],
      }
    },
  })

  const result = await loader.refresh({ days: 7 })

  assert.equal(result.ok, true)
  assert.deepEqual(result.events.map(event => event.id), ['event-early', 'event-late'])
  assert.deepEqual(calls[0], ['auth', 'status', '--json', '--verify'])
  assert.deepEqual(calls[1], [
    'calendar', '+agenda', '--as', 'user',
    '--start', '2026-07-31', '--end', '2026-08-07',
    '--format', 'json',
  ])
  assert.equal(result.events[0].organizer, '同事')
})

test('Lark agenda helpers normalize event links and local date ranges', () => {
  assert.deepEqual(dateRange(new Date('2026-07-31T08:00:00+08:00'), 2), {
    start: '2026-07-31',
    end: '2026-08-02',
  })
  assert.deepEqual(normalizeAgendaEvent({
    event_id: 'event-1',
    summary: '项目会',
    start_time: { datetime: '2026-07-31T11:00:00+08:00', timezone: 'Asia/Shanghai' },
    end_time: { datetime: '2026-07-31T12:00:00+08:00', timezone: 'Asia/Shanghai' },
    app_link: 'https://applink.larkoffice.com/calendar/event-1',
    vchat: { meeting_url: 'https://vc.larkoffice.com/j/123' },
  }), {
    id: 'event-1',
    title: '项目会',
    startAt: '2026-07-31T11:00:00+08:00',
    endAt: '2026-07-31T12:00:00+08:00',
    timezone: 'Asia/Shanghai',
    organizer: '',
    rsvp: '',
    status: 'busy',
    allDay: false,
    url: 'https://applink.larkoffice.com/calendar/event-1',
    meetingUrl: 'https://vc.larkoffice.com/j/123',
  })
})
