import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const values = new Map()
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
}
const cache = new Map()
const ui = { Button: 'button', Input: 'input', Field: 'label', cx: (...classes) => classes.filter(Boolean).join(' ') }
const rowHooks = { cursor: 0, values: [] }
function load(name) {
  const path = resolve(`src/features/event-manager/${name}`)
  if (cache.has(path)) return cache.get(path)
  const source = readFileSync(path, 'utf8') + (name === 'Editor.tsx' ? '\nexport { BriefStep }' : '')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  cache.set(path, exports)
  vm.runInNewContext(compiled, {
    exports, localStorage, crypto, structuredClone, URL,
    require(specifier) {
      if (name === 'RentalEntry.tsx' && specifier === 'react') return {
        useId: () => 'rental-note-test',
        useState: (initial) => {
          const index = rowHooks.cursor++
          if (!(index in rowHooks.values)) rowHooks.values[index] = initial
          return [rowHooks.values[index], (update) => { rowHooks.values[index] = typeof update === 'function' ? update(rowHooks.values[index]) : update }]
        },
      }
      if (specifier === '../../auth/store') return { emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
      if (specifier === '../../components/ui') return ui
      if (['./model', './budget', './preview-data', './theme-boards', './theme-templates', './board-assets', './rental-catalog', './event-rentals', './stock-policy'].includes(specifier)) return load(`${specifier.slice(2)}.ts`)
      if (specifier === './shared') return load('shared.tsx')
      if (specifier.startsWith('.')) return { default: () => null }
      return require(specifier)
    },
  }, { filename: path })
  return exports
}
const { parseBudget, formatBudget, validateBudget } = load('budget.ts')
const { newBrief, themes, themePins, assets } = load('model.ts')
const { validateBrief, clientEmailError, addOneHour, pitchCover, coverAlt, FALLBACK_COVER } = load('shared.tsx')
const { themePitchBrief } = load('theme-boards.ts')
const { previewStudio } = load('preview-data.ts')
const { BriefStep } = load('Editor.tsx')
assert.equal(newBrief().theme, '')
assert.equal(newBrief().estimatedBudget, undefined)
assert.equal(pitchCover(newBrief()), '/event-manager-images/planning.jpg', 'blank pitches use the uploaded default photograph')
assert.match(coverAlt(newBrief()), /Candlelit event reception/)
assert.equal(pitchCover(newBrief(themes[0].name)), themes[0].image, 'preset covers remain unchanged')
assert.equal(pitchCover({ ...newBrief(), pins: [{ image: 'https://example.com/custom.jpg' }] }), 'https://example.com/custom.jpg', 'custom board images retain priority')
assert.equal(pitchCover({ ...newBrief('Custom theme'), registeredTheme: { name: 'Custom theme', cover: 'https://example.com/cover.jpg' } }), 'https://example.com/cover.jpg', 'registered moodboard covers retain priority')
assert.ok(readFileSync(`public${FALLBACK_COVER}`).length > 0, 'default image is bundled locally')
for (const item of [...themes, ...assets]) {
  assert.ok(readFileSync(`public${item.image}`).length > 0, `${item.image} is available`)
}
for (const file of ['public/lumiere-logo.png', 'public/favicon.svg']) {
  assert.ok(readFileSync(file).length > 0, `${file} is available`)
}
for (const email of [undefined, '', '   ', 'name@example.com', 'client+event@example.co.uk']) assert.equal(clientEmailError(email), undefined)
for (const email of ['09171234567', 'name', 'name@', '@example.com', 'name@example', 'name with space@example.com']) assert.ok(clientEmailError(email))
assert.equal(validateBrief({ ...newBrief(), title: 'Draft', client: 'Client' }, false).clientEmail, undefined)
assert.equal(validateBrief({ ...newBrief(), title: 'Draft', client: 'Client' }, true).clientEmail, undefined, 'email remains optional for presentation')
assert.ok(validateBrief({ ...newBrief(), title: 'Draft', client: 'Client', clientEmail: 'invalid' }, false).clientEmail)
for (const [input, expected] of [['', undefined], ['  ', undefined], ['0', 0], ['150000', 150000], ['150,000', 150000], ['150,000.50', 150000.5], ['0.29', 0.29]]) {
  const result = parseBudget(input)
  assert.equal(result.error, undefined, input)
  assert.equal(result.value, expected, input)
}
for (const input of ['-1', '1.234', 'NaN', 'Infinity', '1e3', 'abc', '15,00', '1,2,3', '₱150', '90071992547409910']) {
  assert.ok(parseBudget(input).error, input)
}
for (const amount of [-1, NaN, Infinity, 1.001]) assert.ok(validateBudget(amount))
assert.equal(formatBudget(undefined), '')
assert.equal(formatBudget(0), '0')
assert.equal(formatBudget(150000.5), '150,000.50')

const preset = themes[0]
let brief = { ...newBrief(preset.name), title: 'Client celebration', client: 'Client', clientEmail: 'client@example.com', pins: themePins(preset) }
assert.equal(brief.theme, 'Garden romance')
assert.ok(!brief.theme.includes(preset.category))
const board = {
  id: 'board', details: { name: 'Custom garden', category: 'Wedding', description: '', palette: ['#fff'] },
  pins: brief.pins, boardPages: [{ title: 'Inspiration', background: '#fff' }],
}
const registered = themePitchBrief(board)
assert.equal(registered.theme, 'Custom garden')
assert.equal(registered.registeredTheme.category, 'Wedding')
brief = { ...brief, theme: 'My own event theme', estimatedBudget: 150000.5 }
assert.equal(validateBrief(brief, false).theme, undefined)
assert.equal(validateBrief({ ...brief, theme: '' }, false).theme, undefined, 'blank theme allowed in draft')
assert.ok(validateBrief({ ...brief, theme: '' }, true).theme)
assert.ok(validateBrief({ ...brief, estimatedBudget: -1 }, false).estimatedBudget)

const user = { name: 'Event Manager', email: 'brief-test@example.test' }
const saved = await previewStudio(user, { action: 'save', brief, revision: 0 })
let reopened = (await previewStudio(user))[0]
assert.equal(reopened.brief.theme, 'My own event theme')
assert.equal(reopened.brief.clientEmail, 'client@example.com')
assert.equal(reopened.brief.estimatedBudget, 150000.5)
assert.equal(typeof reopened.brief.estimatedBudget, 'number')
await previewStudio(user, { action: 'save', id: saved.id, revision: saved.revision, brief: { ...reopened.brief, estimatedBudget: undefined, theme: 'Edited theme', clientEmail: 'edited@example.com' } })
reopened = (await previewStudio(user))[0]
assert.equal(reopened.brief.estimatedBudget, undefined)
assert.equal(reopened.brief.theme, 'Edited theme')
assert.equal(reopened.brief.clientEmail, 'edited@example.com')
const legacyBrief = { ...newBrief('Older saved theme'), title: 'Legacy pitch', client: 'Existing client', phone: '09171234567' }
delete legacyBrief.clientEmail
const legacy = await previewStudio(user, { action: 'save', brief: legacyBrief, revision: 0 })
assert.equal((await previewStudio(user)).find((p) => p.id === legacy.id).brief.theme, 'Older saved theme')
assert.equal(legacy.brief.estimatedBudget, undefined)
assert.equal(legacy.brief.clientEmail, undefined, 'old phone numbers are not converted to email')
assert.equal(legacy.brief.phone, '09171234567')
assert.equal(validateBrief(legacy.brief, false).clientEmail, undefined)
await assert.rejects(previewStudio(user, { action: 'save', brief: { ...brief, estimatedBudget: -1 }, revision: 0 }), /non-negative/)

function descendants(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)]
}
const updates = []
let budgetDraft
let emailBlurred = false
const tree = BriefStep({
  brief, update: (patch) => updates.push(patch), errors: {}, readOnly: false, saved: null, user,
  onEmailBlur: () => { emailBlurred = true },
  budgetInput: formatBudget(brief.estimatedBudget), onBudgetChange: (text) => { budgetDraft = text }, onBudgetBlur: () => {},
})
const nodes = descendants(tree)
const emailInputs = nodes.filter((node) => node.type === 'input' && node.props.type === 'email')
assert.equal(emailInputs.length, 1)
assert.equal(emailInputs[0].props.value, 'client@example.com')
assert.equal(emailInputs[0].props.placeholder, 'name@example.com')
assert.equal(emailInputs[0].props['aria-invalid'], undefined, 'no email error before interaction')
assert.equal(nodes.find((node) => node.props.id === 'em-err-clientEmail').props.text, undefined)
emailInputs[0].props.onBlur()
assert.equal(emailBlurred, true, 'email validation is triggered on blur')
assert.ok(!nodes.some((node) => node.props.type === 'tel' || node.props.label === 'SMS number'))
emailInputs[0].props.onChange({ target: { value: 'new@example.com' } })
assert.equal(updates.pop().clientEmail, 'new@example.com')
const contactNodes = (contactBrief) => descendants(BriefStep({
  brief: contactBrief, update() {}, errors: validateBrief(contactBrief, false),
  readOnly: false, saved: null, user,
  budgetInput: '', onBudgetChange() {}, onBudgetBlur() {},
}))
const legacyContact = contactNodes(legacy.brief)
assert.equal(legacyContact.find((node) => node.props.type === 'email').props.value, '', 'legacy phone stays out of email input')
const invalidContact = contactNodes({ ...brief, clientEmail: 'invalid-address' })
assert.equal(invalidContact.find((node) => node.props.type === 'email').props['aria-invalid'], true)
assert.equal(invalidContact.find((node) => node.props.id === 'em-err-clientEmail').props.text, 'Enter a valid email address.')
const editedLegacy = await previewStudio(user, {
  action: 'save', id: legacy.id, revision: legacy.revision,
  brief: { ...legacy.brief, clientEmail: 'legacy-client@example.com' },
})
assert.equal(editedLegacy.brief.phone, '09171234567', 'legacy data preserved when editing')
assert.equal((await previewStudio(user)).find((p) => p.id === legacy.id).brief.clientEmail, 'legacy-client@example.com')
const themeInput = nodes.find((node) => node.type === 'input' && node.props.placeholder === 'Enter event theme')
assert.ok(themeInput, 'theme is a text input')
themeInput.props.onChange({ target: { value: 'Manually edited theme' } })
assert.equal(updates[0].theme, 'Manually edited theme')
const budgetInput = nodes.find((node) => node.type === 'input' && node.props.placeholder === '150,000')
assert.equal(budgetInput.props.value, '150,000.50')
budgetInput.props.onFocus()
assert.equal(budgetDraft, '150000.5', 'grouping removed while editing')
budgetInput.props.onChange({ target: { value: '250,000' } })
assert.equal(budgetDraft, '250,000')
assert.ok(nodes.some((node) => node.props.children === '₱'))
const row = nodes.find((node) => node.props.className === 'grid gap-5 sm:grid-cols-2')
const fields = row.props.children.filter((node) => node?.type === 'div')
const themeField = fields.find((node) => descendants(node).includes(themeInput))
const budgetField = fields.find((node) => descendants(node).includes(budgetInput))
assert.ok(themeField && budgetField)
assert.ok(!themeField.props.className?.includes('col-span-2') && !budgetField.props.className?.includes('col-span-2'), 'theme and budget share responsive two-column grid')

assert.equal(addOneHour('2026-11-11', ''), '2026-11-11')
assert.equal(addOneHour('2026-11-11', '09:00'), '2026-11-11T10:00')
assert.equal(addOneHour('2026-11-11', '23:30'), '2026-11-12T00:30')

let dateBrief = newBrief()
const renderDateStep = () => BriefStep({
  brief: dateBrief,
  update: (patch) => { dateBrief = { ...dateBrief, ...patch } },
  errors: {}, readOnly: false, saved: null, user,
  budgetInput: '', onBudgetChange: () => {}, onBudgetBlur: () => {},
})
const findStartControl = (node) => descendants(node).find((n) => n.props?.label === 'Starts' && n.props?.errKey === 'start')
findStartControl(renderDateStep()).props.onChange('2026-11-11', '')
assert.equal(dateBrief.start, '2026-11-11')
assert.equal(dateBrief.end, '2026-11-11', 'picking start date defaults end date to same date')
findStartControl(renderDateStep()).props.onChange('2026-11-11', '09:30')
assert.equal(dateBrief.start, '2026-11-11T09:30')
assert.equal(dateBrief.end, '2026-11-11T10:30', 'picking start time sets end time 1 hour later')
findStartControl(renderDateStep()).props.onChange('2026-11-11', '14:15')
assert.equal(dateBrief.end, '2026-11-11T15:15', 'updating start time shifts default end time by 1 hour')

console.log('PASS: optional client email, inline validation, save/reopen/edit, legacy phone compatibility, themes, budget, dates, input wiring, and responsive grid.')

const { themeTemplate, insertThemePages } = load('theme-templates.ts')
for (const theme of themes) {
  const template = themeTemplate(theme)
  for (const pin of template.pins) {
    if (pin.image?.startsWith('/')) assert.ok(readFileSync(`public${pin.image}`).length > 0, `${pin.image} is available`)
  }
  assert.equal(template.boardPages.length, 5)
  assert.ok(template.pins.some((pin) => pin.image?.includes('/samples/')))
  const original = newBrief()
  const result = insertThemePages(original, 0, template, [0, 1, 2, 3, 4])
  assert.equal(result.boardPages.length, 5)
  assert.equal(original.pins.length, 0, 'template application does not mutate source')
  assert.ok(result.pins.every((pin) => !pin.bind), 'copied content is independent')
  assert.equal(new Set(result.pins.map((pin) => pin.id)).size, result.pins.length)
  const occupied = { ...original, pins: [{ id: 'keep', title: 'Keep me', width: 100, x: 1, y: 1, rotation: 0 }] }
  const single = insertThemePages(occupied, 0, template, [3])
  assert.equal(single.boardPages.length, 2)
  assert.equal(single.firstPage, 1)
  assert.equal(single.pins[0].id, 'keep')
  assert.ok(single.pins.slice(1).every((pin) => pin.page === 1))
  const again = insertThemePages(original, 0, template, [0])
  assert.ok(!again.pins.some((pin) => result.pins.some((other) => other.id === pin.id)))
  assert.throws(() => insertThemePages({ ...occupied, boardPages: Array.from({ length: 12 }, () => ({ title: 'Existing', background: '#fff' })) }, 0, template, [0]), /12 pages/)
}
console.log('PASS: five theme page sets, single/all application, independent IDs, preserved content, and page limit.')
const { firstPage: _firstPage, ...themePages } = insertThemePages(newBrief(), 0, themeTemplate(themes[0]), [0, 1, 2, 3, 4])
const themedPitch = await previewStudio(user, { action: 'save', revision: 0, brief: { ...newBrief(), title: 'Template pitch', client: 'Client', ...themePages } })
const restoredTemplate = (await previewStudio(user)).find((p) => p.id === themedPitch.id)
assert.equal(restoredTemplate.brief.boardPages.length, 5)
assert.equal(restoredTemplate.brief.pins.length, themePages.pins.length)
console.log('PASS: applied theme pages persist when a pitch is saved and reopened.')

const { syncBoardAssets } = load('board-assets.ts')
const assetPin = (asset, id, page = 0) => ({
  id, title: asset.name, image: asset.image, page, x: 10, y: 10, width: 220, rotation: 0,
})
const boardBrief = { ...newBrief(), title: 'Board asset test', client: 'Client' }
const onePin = assetPin(assets[0], 'one')
let linked = syncBoardAssets({ ...boardBrief, pins: [onePin] })
assert.equal(linked.requirements.length, 1)
assert.equal(linked.requirements[0].assetId, assets[0].id)
assert.equal(linked.requirements[0].quantity, 1)
assert.equal(linked.requirements[0].boardQuantity, 1)
assert.equal(boardBrief.requirements.length, 0, 'does not mutate the original plan')
const added = syncBoardAssets({
  ...linked,
  pins: [onePin, assetPin(assets[0], 'copy', 1), assetPin(assets[1], 'second')],
})
assert.equal(added.requirements.find((r) => r.assetId === assets[0].id).quantity, 2)
assert.equal(added.requirements.find((r) => r.assetId === assets[1].id).quantity, 1)
const removed = syncBoardAssets({ ...added, pins: [onePin] })
assert.equal(removed.requirements.length, 1)
assert.equal(removed.requirements[0].quantity, 1)
const undone = syncBoardAssets({ ...removed, pins: added.pins })
assert.equal(undone.requirements.find((r) => r.assetId === assets[0].id).quantity, 2, 'undo restores board counts')
const redone = syncBoardAssets({ ...undone, pins: [] })
assert.equal(redone.requirements.length, 0, 'deleting the last instance removes automatic rows')
const manual = syncBoardAssets({
  ...boardBrief, pins: [onePin],
  requirements: [{ assetId: assets[0].id, quantity: 10 }, { assetId: assets[2].id, quantity: 4 }],
})
assert.equal(manual.requirements[0].quantity, 10, 'manual quantity is not inflated')
const manualAfterDelete = syncBoardAssets({ ...manual, pins: [] })
assert.equal(manualAfterDelete.requirements[0].quantity, 10)
assert.equal(manualAfterDelete.requirements[1].quantity, 4)
const swappedFrame = syncBoardAssets({ ...linked, pins: [{ ...onePin, kind: 'frame', image: assets[1].image }] })
assert.equal(swappedFrame.requirements.length, 1)
assert.equal(swappedFrame.requirements[0].assetId, assets[1].id, 'replacing frame content updates asset identity')
assert.equal(syncBoardAssets({ ...linked, pins: [{ ...onePin, image: 'https://example.com/upload.jpg' }] }).requirements.length, 0, 'external images do not become catalog requirements')
const planUser = { name: 'Asset test', email: 'asset-sync@example.test' }
const savedBoard = await previewStudio(planUser, { action: 'save', brief: added, revision: 0 })
const restoredBoard = (await previewStudio(planUser)).find((p) => p.id === savedBoard.id)
assert.equal(restoredBoard.brief.requirements[0].boardQuantity, 2)
assert.equal(syncBoardAssets({ ...restoredBoard.brief, pins: [] }).requirements.length, 0, 'saved metadata supports later board deletion')
const overstock = syncBoardAssets({ ...boardBrief, pins: Array.from({ length: assets[0].stock + 1 }, (_, i) => assetPin(assets[0], `stock-${i}`)) })
const availability = await previewStudio(planUser, { action: 'availability', brief: overstock })
assert.equal(availability[0].deficit, 1, 'automatic counts participate in stock/deficit calculations')
console.log('PASS: board asset add, duplicate, delete, undo/redo, frames, manual plans, legacy pins, save/reopen, and availability deficits.')
const technicalEntry = { id: 'technical-test', name: 'LED wall', vendorName: 'Test AV Vendor', quantity: 1, optional: true, selected: false }
const legacyRental = { id: 'legacy-rental', name: 'Existing saved rental', quantity: 2, optional: true, selected: false }
const vendorPitch = await previewStudio(planUser, { action: 'save', revision: 0, brief: { ...boardBrief, rentals: [technicalEntry, legacyRental] } })
const reopenedVendors = (await previewStudio(planUser)).find((p) => p.id === vendorPitch.id).brief.rentals
assert.equal(reopenedVendors[0].vendorName, 'Test AV Vendor')
assert.equal(reopenedVendors[0].name, 'LED wall')
assert.equal(reopenedVendors[1].vendorName, undefined, 'legacy rentals are not assigned invented vendors')
assert.equal(reopenedVendors[1].name, 'Existing saved rental')
console.log('PASS: technical vendor/service save and reopen, with legacy rental compatibility.')

const { rentalVendors, rentalCatalogOptions } = load('rental-catalog.ts')
const { addEventSupplier, isSupplierAdded, rentalDisplay } = load('event-rentals.ts')
const catalogBefore = JSON.stringify(rentalVendors)
const supplierOptions = rentalCatalogOptions()
assert.equal(rentalVendors.length, 6)
assert.equal(supplierOptions.length, 6)
assert.equal(new Set(supplierOptions.map((option) => option.value)).size, 6)
assert.deepEqual(Array.from(supplierOptions, (option) => option.label), [
  'Dalisay Soundworks — Audio supplier', 'Hiraya Audiovisual — AV supplier',
  'Sinag Stage Lighting — Lighting supplier', 'Bayanihan Equipment Rentals — Equipment rental supplier',
  'Narra Tables & Chairs — Furniture rental supplier', 'Tanghalan Productions — Production supplier',
])
assert.ok(supplierOptions.every((option) => !option.group && !option.items))
assert.ok(rentalVendors.every((vendor) => !vendor.items), 'supplier source contains no equipment lists')
const { matchesPickerOption } = load('../../components/SearchableDropdown.tsx')
assert.ok(matchesPickerOption(supplierOptions[0], 'dalisay'))
assert.ok(matchesPickerOption(supplierOptions[0], 'audio supplier'))
assert.ok(!matchesPickerOption(supplierOptions[0], 'speakers'))
assert.ok(matchesPickerOption(supplierOptions[4], 'furniture'))
const legacyItem = {
  id: 'old-speakers', name: 'Speakers', vendorId: 'sample-lighting', itemId: 'old-equipment',
  vendorName: 'Sample Lighting Co.', supplierType: 'Lighting supplier', quantity: 5,
  snapshot: { itemName: 'Speakers', vendorCompany: 'Sample Lighting Co.', supplierType: 'Lighting supplier' },
  selected: true, optional: false, note: 'Keep original specifications.',
}
let eventSuppliers = addEventSupplier([legacyRental, legacyItem], supplierOptions[0].value)
assert.equal(eventSuppliers.length, 3)
assert.equal(eventSuppliers[2].vendorId, 'sample-audio')
assert.equal(eventSuppliers[2].itemId, undefined)
assert.equal(eventSuppliers[2].entryType, 'supplier')
assert.equal(eventSuppliers[2].snapshot.vendorCompany, 'Dalisay Soundworks')
assert.equal(eventSuppliers[2].note, '')
assert.equal(eventSuppliers[2].selected, false, 'new discussed suppliers do not enter client quotes')
assert.equal(eventSuppliers[1], legacyItem, 'no legacy fields are rewritten')
eventSuppliers = eventSuppliers.map((entry) => entry.entryType ? { ...entry, note: 'Discussed setup and availability with client.' } : entry)
const originalNewEntry = eventSuppliers[2]
assert.equal(addEventSupplier(eventSuppliers, supplierOptions[0].value), eventSuppliers, 'duplicate supplier addition is a no-op')
assert.equal(eventSuppliers[2], originalNewEntry)
assert.ok(isSupplierAdded(eventSuppliers, 'sample-lighting'), 'legacy item records prevent duplicate suppliers')
assert.ok(isSupplierAdded([{ ...legacyRental, vendorName: 'Sample Audio Co.' }], 'sample-audio'), 'old company names map without mutating records')
assert.ok(isSupplierAdded([{ ...legacyRental, vendorName: '  DALISAY SOUNDWORKS  ' }], 'sample-audio'))
assert.ok(!isSupplierAdded([legacyRental], 'sample-audio'), 'unidentified legacy entries are not guessed')
assert.throws(() => addEventSupplier([], 'missing-supplier'), /Choose/)
const remainingSuppliers = supplierOptions.filter((option) => !isSupplierAdded(eventSuppliers, option.value))
assert.equal(remainingSuppliers.length, 4)
assert.equal(JSON.stringify(rentalVendors), catalogBefore, 'per-event notes never mutate suppliers')
const savedSupplierPitch = await previewStudio(planUser, { action: 'save', revision: 0, brief: { ...boardBrief, rentals: eventSuppliers } })
const restoredSuppliers = (await previewStudio(planUser)).find((entry) => entry.id === savedSupplierPitch.id).brief.rentals
assert.equal(restoredSuppliers[2].note, originalNewEntry.note)
assert.equal(restoredSuppliers[2].vendorId, 'sample-audio')
assert.equal(JSON.stringify(restoredSuppliers[1]), JSON.stringify(legacyItem), 'legacy quantity, equipment identity, snapshot, note, and quote fields persist unchanged')
assert.equal(restoredSuppliers.filter((entry) => entry.selected).length, 1, 'quote selection count unchanged')
assert.equal(rentalDisplay(restoredSuppliers[1]).vendorCompany, 'Sample Lighting Co.')
const clearedSupplier = { ...restoredSuppliers[2], note: '' }
const updatedSupplierPitch = await previewStudio(planUser, { action: 'save', id: savedSupplierPitch.id, revision: savedSupplierPitch.revision, brief: { ...boardBrief, rentals: [restoredSuppliers[0], restoredSuppliers[1], clearedSupplier] } })
assert.equal(updatedSupplierPitch.brief.rentals[2].note, '')
assert.equal(updatedSupplierPitch.brief.rentals[1].quantity, 5)
assert.equal(updatedSupplierPitch.brief.rentals[1].selected, true)
console.log('PASS: six supplier-only options, name/type search, duplicate prevention including legacy suppliers, notes persistence, and unchanged legacy quote data.')
const RentalEntry = load('RentalEntry.tsx').default
let rowEntry = { ...eventSuppliers[2] }
rowEntry.note = ''
let rowRemoved = false
const renderSupplierRow = (readOnly = false) => {
  rowHooks.cursor = 0
  return descendants(RentalEntry({ entry: rowEntry, readOnly, onChange: (patch) => { rowEntry = { ...rowEntry, ...patch } }, onRemove: () => { rowRemoved = true } }))
}
let supplierNodes = renderSupplierRow()
assert.ok(supplierNodes.some((node) => node.props.children === 'Dalisay Soundworks'))
assert.ok(supplierNodes.some((node) => node.props.children === 'Audio supplier'))
assert.ok(!supplierNodes.some((node) => node.type === 'input' && ['number', 'checkbox'].includes(node.props.type)), 'no quantity or quote/optional controls')
assert.ok(!supplierNodes.some((node) => node.type === 'textarea'))
const actions = supplierNodes.find((node) => node.props.className === 'flex shrink-0 items-center gap-2')
assert.ok(actions, 'note and remove actions share a centered right-hand group')
assert.equal(descendants(actions).filter((node) => node.type === 'button').length, 2)
supplierNodes.find((node) => node.type === 'button' && node.props.children === 'Add note').props.onClick()
supplierNodes = renderSupplierRow()
supplierNodes.find((node) => node.type === 'textarea').props.onChange({ target: { value: 'Client would like an on-site discussion.' } })
supplierNodes = renderSupplierRow()
assert.equal(supplierNodes.find((node) => node.type === 'textarea').props.value, rowEntry.note)
supplierNodes.find((node) => node.type === 'button' && node.props.children === 'Hide note').props.onClick()
supplierNodes = renderSupplierRow()
supplierNodes.find((node) => node.type === 'button' && node.props.children === 'Edit note').props.onClick()
supplierNodes = renderSupplierRow()
supplierNodes.find((node) => node.type === 'button' && node.props.children === 'Clear note').props.onClick()
assert.equal(rowEntry.note, '')
supplierNodes = renderSupplierRow()
supplierNodes.find((node) => node.props['aria-label'] === 'Remove Dalisay Soundworks').props.onClick()
assert.equal(rowRemoved, true)
rowEntry = { ...rowEntry, note: 'Internal discussion only.' }
supplierNodes = renderSupplierRow(true)
assert.equal(supplierNodes.find((node) => node.type === 'textarea').props.readOnly, true)
assert.ok(!supplierNodes.some((node) => node.props.children === 'Add note' || node.props.children === 'Clear note' || node.props['aria-label'] === 'Remove Dalisay Soundworks'))
console.log('PASS: supplier row layout, note add/edit/hide/clear, removal, absence of quantity/checkbox controls, and read-only protection.')
const { LOW_STOCK_THRESHOLD_RATIO, stockThreshold, stockWarning, stockConfirmationKey, unconfirmedStockWarnings, withStockState } = load('stock-policy.ts')
assert.equal(LOW_STOCK_THRESHOLD_RATIO, 0.2)
assert.equal(stockThreshold(40), 8)
assert.equal(stockThreshold(41), 9)
const stockedAsset = assets[0]
assert.equal(stockWarning(stockedAsset.id, 31, 40), null)
assert.equal(stockWarning(stockedAsset.id, 32, 40).reason, 'low_stock')
assert.equal(stockWarning(stockedAsset.id, 40, 40).shortage, 0)
assert.equal(stockWarning(stockedAsset.id, 41, 40).reason, 'shortage')
assert.equal(stockWarning(stockedAsset.id, 41, 40).shortage, 1)
assert.equal(JSON.stringify(withStockState(newBrief(), [], 'blank')), JSON.stringify(newBrief()), 'blank brief stays unchanged')
const stockUser = { name: 'Stock tests', email: 'stock-flow@example.test' }
const bookedBrief = { ...newBrief(), title: 'Approved booking', client: 'Client', venue: 'Room A', start: '2027-04-10T10:00', end: '2027-04-10T12:00', pins: [onePin], requirements: [{ assetId: stockedAsset.id, quantity: 25 }] }
const booking = await previewStudio(stockUser, { action: 'save', brief: bookedBrief, revision: 0 })
await previewStudio(stockUser, { action: 'approve', id: booking.id, revision: booking.revision, approvalNote: 'Client approved' })
const lowBrief = { ...bookedBrief, title: 'Low-stock draft', venue: 'Room B', requirements: [{ assetId: stockedAsset.id, quantity: 10 }] }
const lowAvailability = await previewStudio(stockUser, { action: 'availability', brief: lowBrief })
assert.equal(lowAvailability[0].available, 15, 'approved booking and buffer calculations unchanged')
const acceptedKey = stockConfirmationKey(lowBrief, stockedAsset.id, 10, 15)
const low = await previewStudio(stockUser, { action: 'save', eventId: 'event-low-stock', revision: 0, brief: { ...lowBrief, requirements: [{ ...lowBrief.requirements[0], stockConfirmation: acceptedKey }] } })
assert.equal(low.id, 'event-low-stock')
assert.equal(low.brief.replenishments.length, 1)
assert.equal(low.brief.replenishments[0].eventId, low.id)
assert.equal(low.brief.replenishments[0].reason, 'low_stock')
assert.equal(low.brief.replenishments[0].status, 'pending')
assert.equal(low.brief.replenishments[0].available, 15)
assert.equal(low.brief.replenishments[0].shortage, 0)
assert.equal(low.brief.requirements[0].stockConfirmation, acceptedKey)
const shortageDraft = await previewStudio(stockUser, { action: 'save', id: low.id, revision: low.revision, brief: { ...low.brief, requirements: [{ ...low.brief.requirements[0], quantity: 20 }] } })
assert.equal(shortageDraft.brief.replenishments.length, 1, 'updates existing pending record instead of appending')
assert.equal(shortageDraft.brief.replenishments[0].id, low.brief.replenishments[0].id)
assert.equal(shortageDraft.brief.replenishments[0].requested, 20)
assert.equal(shortageDraft.brief.replenishments[0].available, 15)
assert.equal(shortageDraft.brief.replenishments[0].shortage, 5)
assert.equal(shortageDraft.brief.replenishments[0].reason, 'shortage')
assert.equal(shortageDraft.brief.requirements[0].stockConfirmation, undefined, 'quantity changes invalidate confirmation')
const stillAvailable = await previewStudio(stockUser, { action: 'availability', id: shortageDraft.id, brief: shortageDraft.brief })
assert.equal(stillAvailable[0].available, 15, 'pending stock is not counted as available')
assert.equal(unconfirmedStockWarnings(shortageDraft.brief, stillAvailable).length, 1, 'unconfirmed shortage is flagged')
await assert.rejects(previewStudio(stockUser, { action: 'approve', id: shortageDraft.id, revision: shortageDraft.revision, approvalNote: 'Not enough stock' }), /replenishment/)
const confirmedShortageKey = stockConfirmationKey(shortageDraft.brief, stockedAsset.id, 20, 15)
const confirmedShortageBrief = { ...shortageDraft.brief, requirements: [{ ...shortageDraft.brief.requirements[0], stockConfirmation: confirmedShortageKey }] }
assert.equal(unconfirmedStockWarnings(confirmedShortageBrief, stillAvailable).length, 0, 'confirmed shortage clears approval block')
const readyShortage = await previewStudio(stockUser, { action: 'save', id: low.id, revision: shortageDraft.revision, status: 'ready', brief: confirmedShortageBrief })
assert.equal(readyShortage.brief.requirements[0].stockConfirmation, confirmedShortageKey)
const approvedWithShortage = await previewStudio(stockUser, { action: 'approve', id: low.id, revision: readyShortage.revision, approvalNote: 'Approved with confirmed replenishment request' })
assert.equal(approvedWithShortage.status, 'approved', 'approval succeeds after shortage request confirmation')
const availableAfterShortageApproval = await previewStudio(stockUser, { action: 'availability', brief: lowBrief })
assert.equal(availableAfterShortageApproval[0].available, 0, 'available stock does not increase when shortage is approved')
const editableLow = await previewStudio(stockUser, { action: 'save', eventId: 'event-editable-stock', revision: 0, brief: { ...shortageDraft.brief, venue: 'Room C' } })
const changedDates = await previewStudio(stockUser, { action: 'save', id: editableLow.id, revision: editableLow.revision, brief: { ...editableLow.brief, start: '2027-04-20T10:00', end: '2027-04-20T12:00' } })
assert.equal(changedDates.brief.replenishments.length, 0, 'resolved pending requirements clear on date changes')
const shortageAgain = await previewStudio(stockUser, { action: 'save', id: editableLow.id, revision: changedDates.revision, brief: { ...changedDates.brief, requirements: [{ assetId: stockedAsset.id, quantity: 41 }] } })
assert.equal(shortageAgain.brief.replenishments[0].start, '2027-04-20T10:00')
assert.equal(shortageAgain.brief.replenishments[0].shortage, 1)
const reduced = await previewStudio(stockUser, { action: 'save', id: editableLow.id, revision: shortageAgain.revision, brief: { ...shortageAgain.brief, requirements: [{ assetId: stockedAsset.id, quantity: 1 }] } })
assert.equal(reduced.brief.replenishments.length, 0, 'quantity reduction clears resolved records')
console.log('PASS: threshold boundaries/rounding, dated availability, pending persistence/IDs, duplicate prevention, updates/resolution, and confirmed-request approval flow.')
