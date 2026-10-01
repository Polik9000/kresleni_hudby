// End-to-end test celé pipeline F1 nad skutečnou aplikací:
// import audia → nahrání tahu a ohňostrojů → uložení → export MP4 → znovunačtení projektu.
// Spuštění: npm run test:e2e
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import ffmpegPath from 'ffmpeg-static'
import { _electron as electron } from 'playwright-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'tests', 'e2e', 'output')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const AUDIO_SECONDS = 8
const paths = {
  audio: join(out, 'test.wav'),
  project: join(out, 'test.khproj'),
  video: join(out, 'test.mp4'),
  frame: join(out, 'frame.png')
}

/** Testovací WAV: tón 440 Hz s krátkým pípnutím každou sekundu. */
function writeTestWav(path, seconds) {
  const rate = 44100
  const samples = rate * seconds
  const buf = Buffer.alloc(44 + samples * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    const t = i / rate
    const beep = t % 1 < 0.08 ? Math.sin(2 * Math.PI * 1320 * t) * 0.5 : 0
    buf.writeInt16LE(Math.round((Math.sin(2 * Math.PI * 440 * t) * 0.2 + beep) * 32767), 44 + i * 2)
  }
  writeFileSync(path, buf)
}

writeTestWav(paths.audio, AUDIO_SECONDS)

// Vlastní složka s daty aplikace, aby test nesahal na zálohu skutečného uživatele.
const userData = join(out, 'user-data')
const recoveryFile = join(userData, 'neulozeny-projekt.khproj')
// --mute-audio: testovací tón s pípáním nemá při běhu testu hrát z reproduktorů.
const launch = () => electron.launch({ args: [root, `--user-data-dir=${userData}`, '--mute-audio'] })
const waitFor = async (condition, message) => {
  for (let i = 0; i < 50; i++) {
    if (condition()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.fail(message)
}
const savedLayer = () => JSON.parse(readFileSync(paths.project, 'utf8')).layers[0]

let recoveryJson = null
let app = await launch()
const errors = []
try {
  // Nativní dialogy nejde ovládat — nahradí se pevnými odpověďmi.
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async (_win, options) => ({
      canceled: false,
      filePaths: [options.title === 'Importovat audio' ? p.audio : p.project]
    })
    dialog.showSaveDialog = async (_win, options) => ({
      canceled: false,
      filePath: options.title === 'Exportovat video' ? p.video : p.project
    })
  }, paths)

  const page = await app.firstWindow()
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  await page.waitForSelector('#stage')

  // --- Import audia ---
  await page.click('#btn-import')
  await page.waitForFunction(() => document.getElementById('audio-name').textContent === 'test.wav')
  await page.waitForFunction((s) => document.getElementById('time').textContent.endsWith(`0:0${s}.0`), AUDIO_SECONDS)

  // --- Nastavení vzhledu před nahráváním ---
  await page.fill('#line-color', '#ff3366')
  await page.click('text=Podle rychlosti')
  await page.fill('#width', '24')

  // --- Kreslení nanečisto se nesmí uložit ---
  const box = await page.locator('#stage').boundingBox()
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
  await page.mouse.move(...at(0.1, 0.1))
  await page.mouse.down()
  await page.mouse.move(...at(0.3, 0.2), { steps: 10 })
  await page.mouse.up()
  assert.match(await page.textContent('#layer-stats'), /0 tahů, 0 ohňostrojů/)

  // --- Nahrávání: vlnovka, klik, pravé tlačítko, klávesa F ---
  // Odpočet jde zrušit; napodruhé doběhne a teprve pak se nahrává.
  await page.click('#btn-record')
  assert.equal(await page.textContent('#countdown'), '3')
  assert.equal(await page.textContent('#btn-record'), 'Zrušit (3)')
  await page.keyboard.press('r')
  assert.equal(await page.isHidden('#countdown'), true)
  const countdownStarted = Date.now()
  await page.click('#btn-record')
  await page.waitForFunction(() => document.body.classList.contains('recording'))
  const countdownSeconds = (Date.now() - countdownStarted) / 1000
  assert.ok(countdownSeconds > 2.8 && countdownSeconds < 3.6, `odpočet trval ${countdownSeconds} s`)
  assert.equal(await page.isHidden('#countdown'), true)
  await page.waitForTimeout(300)
  await page.mouse.move(...at(0.1, 0.5))
  await page.mouse.down()
  for (let i = 1; i <= 60; i++) {
    const f = i / 60
    // První polovina pomalu, druhá rychle — ověří dynamickou tloušťku.
    await page.mouse.move(...at(0.1 + 0.8 * f * f, 0.5 + 0.3 * Math.sin(f * Math.PI * 4)))
    await page.waitForTimeout(f < 0.5 ? 25 : 6)
  }
  await page.mouse.up()

  // Kreslení bez tlačítka (touchpad): držená klávesa D + pohyb = tah, klik během toho se ignoruje.
  await page.mouse.move(...at(0.2, 0.85))
  await page.keyboard.down('d')
  assert.equal(await page.isVisible('#draw-badge'), true)
  await page.mouse.move(...at(0.5, 0.9), { steps: 6 })
  await page.mouse.click(...at(0.5, 0.9))
  await page.mouse.move(...at(0.8, 0.85), { steps: 6 })
  await page.keyboard.up('d')
  assert.equal(await page.isVisible('#draw-badge'), false)
  // Stisk bez pohybu nesmí zanechat tečku; pohyb bez klávesy nekreslí.
  await page.keyboard.press('d')
  await page.mouse.move(...at(0.6, 0.6), { steps: 3 })
  assert.match(await page.textContent('#layer-stats'), /2 tahů, 0 ohňostrojů/)

  await page.mouse.click(...at(0.3, 0.25))
  await page.mouse.click(...at(0.7, 0.3), { button: 'right' })
  await page.mouse.move(...at(0.5, 0.7))
  await page.keyboard.press('f')
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(out, 'recording.png') })

  // Nahrávání skončí samo, když skladba dohraje.
  await page.waitForFunction(() => !document.body.classList.contains('recording'), null, { timeout: 15000 })
  assert.match(await page.textContent('#layer-stats'), /2 tahů, 3 ohňostrojů/)

  // --- Projekt ještě nemá soubor: po dokončení nahrávky vznikne záloha ---
  await waitFor(() => {
    if (!existsSync(recoveryFile)) return false
    recoveryJson = readFileSync(recoveryFile, 'utf8')
    return JSON.parse(recoveryJson).layers[0].fireworks.length === 3
  }, 'záloha neuloženého projektu s nahrávkou nevznikla')

  // --- Zpět / znovu ---
  await page.keyboard.press('Control+z')
  assert.match(await page.textContent('#layer-stats'), /0 tahů, 0 ohňostrojů/)
  await page.keyboard.press('Control+y')
  assert.match(await page.textContent('#layer-stats'), /2 tahů, 3 ohňostrojů/)

  // --- Uložení projektu ---
  await page.keyboard.press('Control+s')
  await page.waitForFunction(() => document.getElementById('toast').textContent === 'Projekt uložen.')
  const saved = JSON.parse(readFileSync(paths.project, 'utf8'))
  assert.equal(saved.format, 'kresleni-hudby')
  assert.equal(saved.audio.relativePath, 'test.wav')
  assert.equal(saved.layers[0].style.lineColor, '#ff3366')
  assert.equal(saved.layers[0].style.widthMode, 'dynamic')
  assert.equal(saved.layers[0].fireworks.length, 3)
  const strokeTimes = saved.layers[0].strokes[0].filter((_, i) => i % 3 === 2)
  assert.ok(strokeTimes.length > 30, 'tah má dost bodů')
  assert.ok(strokeTimes[0] > 0.1 && strokeTimes.at(-1) < AUDIO_SECONDS, 'časy bodů leží uvnitř skladby')
  assert.ok(strokeTimes.every((t, i) => i === 0 || t >= strokeTimes[i - 1]), 'časy bodů neklesají')
  await waitFor(() => !existsSync(recoveryFile), 'záloha po uložení projektu nezmizela')

  // --- Automatické ukládání: změny se samy propíšou do souboru projektu ---
  await page.keyboard.press('Control+z')
  await waitFor(() => savedLayer().strokes.length === 0, 'automatické uložení po kroku Zpět neproběhlo')
  await page.keyboard.press('Control+y')
  await page.fill('#smoothing', '0.8')
  await waitFor(
    () => savedLayer().strokes.length === 2 && savedLayer().style.smoothing === 0.8,
    'automatické uložení po změně nastavení neproběhlo'
  )
  assert.match(await page.textContent('#save-status'), /^Automaticky uloženo/)

  // --- Celá obrazovka: plátno vyplní maximum plochy a drží poměr stran 16:9 ---
  await page.keyboard.press('F11')
  await page.waitForFunction(() => document.body.classList.contains('fullscreen'))
  await page.waitForTimeout(400)
  const full = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect()
    return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, panel: document.querySelector('.panel').offsetWidth }
  })
  assert.ok(Math.abs(full.w / full.h - 16 / 9) < 0.01, 'poměr stran plátna je 16:9')
  assert.ok(Math.abs(full.w - full.vw) < 1 || Math.abs(full.h - full.vh) < 1, 'plátno sahá k okraji obrazovky')
  assert.ok(full.w <= full.vw + 1 && full.h <= full.vh + 1, 'plátno nepřesahuje obrazovku')
  assert.equal(full.panel, 0, 'ovládací panel je na celé obrazovce skrytý')

  // Kurzor je na celé obrazovce zamčený v plátně: hýbe se s myší, ale za okraj neodjede.
  assert.equal(await page.evaluate(() => document.pointerLockElement?.id), 'stage')
  const cursorLeft = () => page.evaluate(() => parseFloat(document.getElementById('locked-cursor').style.left))
  await page.mouse.move(300, 300)
  await page.mouse.move(400, 300, { steps: 5 })
  const before = await cursorLeft()
  await page.mouse.move(500, 300, { steps: 5 })
  const after = await cursorLeft()
  assert.ok(Math.abs(after - before - 100) < 2, `kurzor se posunul o ${after - before} px místo 100`)
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(100, 300)
    await page.mouse.move(1800, 300, { steps: 4 })
  }
  assert.ok(Math.abs((await cursorLeft()) - (full.vw + full.w) / 2) < 1, 'kurzor se zastavil na pravém okraji plátna')
  assert.equal(await page.isVisible('#locked-cursor'), true)
  await page.screenshot({ path: join(out, 'fullscreen.png') })
  await page.keyboard.press('F11')
  await page.waitForFunction(() => !document.body.classList.contains('fullscreen'))

  // --- Export ---
  const exportStarted = Date.now()
  await page.click('#btn-export')
  await page.waitForFunction(() => document.getElementById('export-status').textContent.startsWith('Hotovo'), null, {
    timeout: 120000
  })
  const exportSeconds = (Date.now() - exportStarted) / 1000
  await page.click('#export-cancel')

  const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', paths.video], { encoding: 'utf8' }).stderr
  assert.match(probe, /Video: h264.*yuv420p.*1920x1080.*30 fps/s)
  assert.match(probe, /Audio: aac/)
  const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe)
  const videoSeconds = Number(h) * 3600 + Number(m) * 60 + Number(s)
  assert.ok(Math.abs(videoSeconds - AUDIO_SECONDS) < 0.15, `délka videa ${videoSeconds}s odpovídá audiu`)

  // Snímek z okamžiku těsně po konci tahu — pro vizuální kontrolu.
  const frameTime = String(Math.min(strokeTimes.at(-1) + 0.2, AUDIO_SECONDS - 0.1))
  spawnSync(ffmpegPath, ['-y', '-loglevel', 'error', '-ss', frameTime, '-i', paths.video, '-frames:v', '1', paths.frame])
  assert.ok(existsSync(paths.frame), 'z videa jde vytáhnout snímek')

  // --- Nový projekt a znovunačtení ---
  await page.keyboard.press('Control+n')
  assert.match(await page.textContent('#layer-stats'), /0 tahů, 0 ohňostrojů/)
  assert.equal(await page.textContent('#audio-name'), 'Žádné audio')
  await page.keyboard.press('Control+o')
  await page.waitForFunction(() => document.getElementById('audio-name').textContent === 'test.wav')
  assert.match(await page.textContent('#layer-stats'), /2 tahů, 3 ohňostrojů/)
  assert.equal(await page.inputValue('#line-color'), '#ff3366')
  assert.equal(await page.inputValue('#width'), '24')

  // Náhled v čase, kdy je tah vidět.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)))
  const timelineBox = await page.locator('#timeline').boundingBox()
  await page.mouse.click(
    timelineBox.x + (timelineBox.width * Number(frameTime)) / AUDIO_SECONDS,
    timelineBox.y + timelineBox.height / 2
  )
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(out, 'reloaded.png') })

  assert.deepEqual(errors, [], 'žádné chyby v konzoli')
  const total = Math.ceil(AUDIO_SECONDS * 30)
  console.log(`OK — export ${total} snímků za ${exportSeconds.toFixed(1)} s (${(total / exportSeconds).toFixed(0)} fps)`)
} finally {
  await app.close()
}

// --- Obnovení po pádu: při startu se nabídne záloha neuloženého projektu ---
writeFileSync(recoveryFile, recoveryJson)
app = await launch()
try {
  const page = await app.firstWindow()
  page.on('dialog', (dialog) => {
    assert.match(dialog.message(), /neuložený projekt/)
    void dialog.accept()
  })
  await page.waitForFunction(() => document.getElementById('audio-name').textContent === 'test.wav')
  assert.match(await page.textContent('#layer-stats'), /2 tahů, 3 ohňostrojů/)
  assert.match(await page.textContent('#save-status'), /^Obnoveno ze zálohy/)
  console.log('OK — obnovení ze zálohy')
} finally {
  // Okno se ptá na neuložené změny; test ho zavírá natvrdo.
  await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {})
}
