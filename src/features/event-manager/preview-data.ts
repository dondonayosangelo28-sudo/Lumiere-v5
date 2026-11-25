import * as opsStore from '../../operations/store';
import { isVenueLocation, type VenueLocation } from '../../operations/venue-location';
import { validateBudget } from './pitch-editor/budget';
import { assets, themes, type Availability, type Brief, type Project } from './model';
import { unconfirmedStockWarnings, withStockState } from './stock-policy';

type StudioUser = { name: string; email: string };

type Audit = { actor: string; action: string; at: string; revision: number };
type Record = { project: Project; audit: Audit[] };
type Action =
  | { action: 'availability'; brief: Brief; id?: string }
  | { action: 'save'; brief: Brief; id?: string; revision: number; status?: Project['status']; eventId?: string }
  | { action: 'approve'; id: string; revision: number; approvalNote: string }
  | { action: 'delete'; id: string; revision: number };

const namespace = 'lumiere-event-manager-preview-v1';
const day = 86_400_000;
const storageKey = (user: StudioUser) => `${namespace}:${user.email.trim().toLowerCase()}`;

function buildSeedRecords(user: StudioUser): Record[] {
  const celesteProject: Project = {
    id: 'evt-celeste-marcos',
    status: 'approved',
    revision: 3,
    processedBy: user.name || 'Event Manager',
    createdAt: '2026-04-10T10:00:00.000Z',
    updatedAt: '2026-04-12T18:10:00.000Z',
    approvedAt: '2026-04-12T18:10:00.000Z',
    approvalNote: 'Approved by Celeste Villanueva after live presentation; reserve arch, crystal chandeliers, and chairs.',
    brief: {
      title: 'Celeste & Marcos Garden Reception',
      client: 'Celeste Villanueva',
      clientEmail: 'celeste.villanueva@velvetatelier.ph',
      start: '2026-04-25T16:00',
      end: '2026-04-25T23:00',
      pax: 180,
      venue: 'The Glasshouse at Fernbrook, Alabang',
      theme: 'Garden romance',
      estimatedBudget: 680000,
      notes: 'Outdoor-to-glasshouse transition reception; custom monogram plinth pair at ceremony arch entrance.',
      pins: [
        { id: 'pin-celeste-1', title: 'Garden romance', image: '/event-manager-images/garden.jpg', x: 5, y: 5, width: 300, rotation: -2 },
        { id: 'pin-celeste-2', title: 'Pink rose bouquet', image: '/event-manager-images/cutouts/evtast-0001.webp', x: 45, y: 12, width: 180, rotation: 1 },
      ],
      requirements: [
        { assetId: 'evtast-0001', quantity: 12, manualQuantity: 12, boardQuantity: 1 },
        { assetId: 'evtast-0010', quantity: 24, manualQuantity: 24, boardQuantity: 0 },
        { assetId: 'evtast-0018', quantity: 1, manualQuantity: 1, boardQuantity: 0 },
      ],
      customItems: [
        {
          id: 'cust-celeste-monogram-arch',
          name: 'Bespoke Brass & Travertine Monogram Plinth Pair',
          quantity: 2,
          dimensions: '2.4m H × 0.9m W × 0.6m D',
          materials: 'Brushed brass framing, honed travertine panels, weighted steel baseplate',
          colors: 'Warm Champagne Gold (#C8A96A) & Ivory Travertine (#F3EFE6)',
          finish: 'Satin matte lacquer with weather-sealed seams',
          instructions: 'Weld internal steel baseplate for wind stability at Glasshouse Lawn. Mount laser-cut C&M monogram at 1.65m eye level and conceal warm LED uplight channel in base.',
          referenceImages: ['/event-manager-images/garden.jpg'],
        },
      ],
      rentals: [
        {
          id: 'rnt-celeste-1',
          entryType: 'supplier',
          vendorId: 'sample-lighting',
          name: 'Sinag Stage Lighting',
          vendorName: 'Sinag Stage Lighting',
          supplierType: 'Lighting supplier',
          itemName: 'Low-profile aluminum box truss & warm architectural wash package (12m span)',
          directToVenue: true,
          note: 'Confirm low-profile chain hoist clearance with Fernbrook engineering before load-in.',
          snapshot: {
            itemName: 'Low-profile aluminum box truss & warm architectural wash package (12m span)',
            vendorCompany: 'Sinag Stage Lighting',
            supplierType: 'Lighting supplier',
          },
          quantity: 4,
          optional: true,
          selected: false,
        },
      ],
    },
  };

  const solsticeProject: Project = {
    id: 'evt-solstice-gala',
    status: 'ready',
    revision: 2,
    processedBy: user.name || 'Event Manager',
    createdAt: '2026-04-14T09:00:00.000Z',
    updatedAt: '2026-04-14T15:30:00.000Z',
    brief: {
      title: 'Solstice Brand Launch & Gala',
      client: 'Aurelia Meridian Group',
      clientEmail: 'events@aureliameridian.ph',
      start: '2026-05-09T18:00',
      end: '2026-05-09T23:30',
      pax: 240,
      venue: 'Metropolitan Pavilion, BGC',
      theme: 'Beautifully on brand',
      estimatedBudget: 920000,
      notes: 'Ready for client approval. Includes stock vessels & florals, custom illuminated sculptural podium, and direct-to-venue AV LED wall rental.',
      pins: [
        { id: 'pin-solstice-1', title: 'Beautifully on brand', image: '/event-manager-images/corporate.jpg', x: 6, y: 6, width: 300, rotation: -1 },
        { id: 'pin-solstice-2', title: 'Gold eucalyptus spray', image: '/event-manager-images/cutouts/evtast-0013.webp', x: 48, y: 14, width: 180, rotation: 2 },
      ],
      requirements: [
        { assetId: 'evtast-0013', quantity: 18, manualQuantity: 18, boardQuantity: 1 },
        { assetId: 'evtast-0019', quantity: 30, manualQuantity: 30, boardQuantity: 0 },
      ],
      customItems: [
        {
          id: 'cust-solstice-podium',
          name: 'Sculptural Fluted Ash & Brushed Bronze Keynote Podium',
          quantity: 1,
          dimensions: '1.25m H × 0.85m W × 0.55m D',
          materials: 'Kiln-dried fluted ash wood, brushed bronze inlay trim, concealed cable conduit',
          colors: 'Smoked Walnut (#4A3B31) & Brushed Bronze (#A88456)',
          finish: 'Low-glare studio polyurethane finish for stage lighting',
          instructions: 'Route dual XLR and HDMI pass-through channels inside central column; recess laser-etched Aurelia crest on front fascia.',
          referenceImages: ['/event-manager-images/corporate.jpg'],
        },
      ],
      rentals: [
        {
          id: 'rnt-solstice-1',
          entryType: 'supplier',
          vendorId: 'sample-av',
          name: 'Hiraya Audiovisual',
          vendorName: 'Hiraya Audiovisual',
          supplierType: 'AV supplier',
          itemName: 'Curved P2.6 Fine-Pitch LED Wall (8m × 3.5m) with redundant processor',
          directToVenue: true,
          note: 'Direct-to-venue delivery to Metropolitan Pavilion Loading Dock C at 08:00 AM.',
          snapshot: {
            itemName: 'Curved P2.6 Fine-Pitch LED Wall (8m × 3.5m) with redundant processor',
            vendorCompany: 'Hiraya Audiovisual',
            supplierType: 'AV supplier',
          },
          quantity: 2,
          optional: true,
          selected: false,
        },
      ],
    },
  };

  return [
    {
      project: solsticeProject,
      audit: [
        { actor: user.name || 'Event Manager', action: 'Marked ready for client presentation', at: '2026-04-14T15:30:00.000Z', revision: 2 },
        { actor: user.name || 'Event Manager', action: 'Pitch created', at: '2026-04-14T09:00:00.000Z', revision: 1 },
      ],
    },
    {
      project: celesteProject,
      audit: [
        { actor: user.name || 'Event Manager', action: 'Client approval recorded', at: '2026-04-12T18:10:00.000Z', revision: 3 },
        { actor: user.name || 'Event Manager', action: 'Pitch revised', at: '2026-04-11T14:20:00.000Z', revision: 2 },
        { actor: user.name || 'Event Manager', action: 'Pitch created', at: '2026-04-10T10:00:00.000Z', revision: 1 },
      ],
    },
  ];
}

const read = (user: StudioUser): Record[] => {
  const raw = localStorage.getItem(storageKey(user));
  if (!raw) {
    const seeded = buildSeedRecords(user);
    localStorage.setItem(storageKey(user), JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as Record[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = buildSeedRecords(user);
      localStorage.setItem(storageKey(user), JSON.stringify(seeded));
      return seeded;
    }
    return parsed;
  } catch {
    return buildSeedRecords(user);
  }
};

const write = (user: StudioUser, records: Record[]) => localStorage.setItem(storageKey(user), JSON.stringify(records));

/**
 * Recovers a saved venue pin from Event Manager `{ project, audit }` records
 * matched strictly by `projectId` or `eventId` (no title matching).
 */
export function findSavedProjectVenueLocation(lookup: {
  projectId?: string;
  eventId?: string;
}): VenueLocation | undefined {
  const candidateIds = new Set(
    [lookup.projectId, lookup.eventId]
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map(id => id.trim()),
  );
  if (candidateIds.size === 0) return undefined;

  for (const handoff of pendingHandoffs.values()) {
    const project = handoff?.project;
    if (project && candidateIds.has(project.id) && isVenueLocation(project.brief?.venueLocation)) {
      return project.brief.venueLocation;
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const prefix = `${namespace}:`;
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const records = JSON.parse(raw) as Array<{ project?: Project; audit?: Audit[] }>;
        if (!Array.isArray(records)) continue;
        const matched = records.find(
          record =>
            typeof record?.project?.id === 'string' &&
            candidateIds.has(record.project.id.trim()),
        );
        if (matched?.project && isVenueLocation(matched.project.brief?.venueLocation)) {
          return matched.project.brief.venueLocation;
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      const handoffPrefix = 'lumiere-approval-handoff-v1:';
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (!key || !key.startsWith(handoffPrefix)) continue;
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { project?: Project } | null;
        if (
          parsed?.project &&
          typeof parsed.project.id === 'string' &&
          candidateIds.has(parsed.project.id.trim()) &&
          isVenueLocation(parsed.project.brief?.venueLocation)
        ) {
          return parsed.project.brief.venueLocation;
        }
      }
    }
  } catch {
    // Ignore sessionStorage read errors
  }

  return undefined;
}

export type PendingApprovalHandoff = {
  project: Project;
  auditEntry: Audit;
  eventManagerSaved: boolean;
  warehouseSaved: boolean;
};

export class ApprovalHandoffError extends Error {
  handoff: PendingApprovalHandoff;
  constructor(message: string, handoff: PendingApprovalHandoff) {
    super(message);
    this.name = 'ApprovalHandoffError';
    this.handoff = handoff;
  }
}

const pendingHandoffs = new Map<string, PendingApprovalHandoff>();
const handoffSessionKey = (user: StudioUser, projectId: string) =>
  `lumiere-approval-handoff-v1:${user.email.trim().toLowerCase()}:${projectId}`;

function savePendingHandoff(user: StudioUser, handoff: PendingApprovalHandoff) {
  const key = handoffSessionKey(user, handoff.project.id);
  pendingHandoffs.set(key, handoff);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, JSON.stringify(handoff));
    }
  } catch {
    // ignore sessionStorage quota failures
  }
}

function clearPendingHandoff(user: StudioUser, projectId: string) {
  const key = handoffSessionKey(user, projectId);
  pendingHandoffs.delete(key);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function getPendingApprovalHandoff(user: StudioUser, projectId: string): PendingApprovalHandoff | null {
  const key = handoffSessionKey(user, projectId);
  const inMem = pendingHandoffs.get(key);
  if (inMem) return inMem;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingApprovalHandoff;
        if (parsed?.project?.id === projectId) {
          pendingHandoffs.set(key, parsed);
          return parsed;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function executeApprovalHandoff(user: StudioUser, handoff: PendingApprovalHandoff): Project {
  const next: PendingApprovalHandoff = { ...handoff };

  if (!next.eventManagerSaved) {
    try {
      const currentRecords = read(user);
      const existing = currentRecords.find(r => r.project.id === next.project.id);
      if (existing?.project.status === 'approved' && existing.project.revision > next.project.revision) {
        // Do not overwrite a newer persisted Event Manager approval with a stale pending handoff
        next.project = existing.project;
        next.eventManagerSaved = true;
      } else {
        const remaining = currentRecords.filter(r => r.project.id !== next.project.id);
        const alreadyHasAudit = (existing?.audit ?? []).some(
          a => a.at === next.auditEntry.at && a.revision === next.auditEntry.revision,
        );
        const nextAudit = alreadyHasAudit
          ? existing!.audit
          : [next.auditEntry, ...(existing?.audit ?? [])];
        write(user, [{ project: next.project, audit: nextAudit }, ...remaining]);
        next.eventManagerSaved = true;
      }
    } catch {
      next.eventManagerSaved = false;
    }
  }

  if (!next.warehouseSaved) {
    try {
      const hadWarning = Boolean(opsStore.getOperationsPersistenceWarning?.());
      if (hadWarning && opsStore.retryPersistOperationsStore) {
        const retryRes = opsStore.retryPersistOperationsStore();
        if (!retryRes.ok || opsStore.getOperationsPersistenceWarning?.()) {
          next.warehouseSaved = false;
        }
      }
      if (!opsStore.getOperationsPersistenceWarning?.()) {
        opsStore.publishApprovedEventToWarehouse(next.project, user);
        const hasPersistenceWarning = Boolean(opsStore.getOperationsPersistenceWarning?.());
        const hasOrderInStore =
          typeof opsStore.readOperationsStore === 'function'
            ? opsStore.readOperationsStore().orderRequests.some(o => o.eventId === next.project.id)
            : true;
        next.warehouseSaved = !hasPersistenceWarning && hasOrderInStore;
      } else {
        next.warehouseSaved = false;
      }
    } catch {
      next.warehouseSaved = false;
    }
  }

  if (next.eventManagerSaved && next.warehouseSaved) {
    clearPendingHandoff(user, next.project.id);
    return next.project;
  }

  savePendingHandoff(user, next);
  const msg = !next.eventManagerSaved && !next.warehouseSaved
    ? 'Approval handoff failed: neither Event Manager nor Warehouse records could be saved to browser storage. Retry handoff once storage space is available.'
    : !next.eventManagerSaved
      ? 'Approval handoff incomplete: Warehouse order saved, but Event Manager approval could not be saved to browser storage. Retry handoff to finish saving.'
      : 'Approval handoff incomplete: Event Manager approval saved, but Warehouse order could not be saved to browser storage. Retry handoff to finish publishing.';
  throw new ApprovalHandoffError(msg, next);
}

export async function retryApprovalHandoff(user: StudioUser, projectId: string): Promise<Project> {
  const pending = getPendingApprovalHandoff(user, projectId);
  if (pending) {
    return executeApprovalHandoff(user, pending);
  }
  const existing = read(user).find(r => r.project.id === projectId);
  if (existing?.project.status === 'approved') {
    const auditEntry = existing.audit[0] ?? {
      actor: user.name,
      action: 'Client approval recorded',
      at: existing.project.approvedAt || new Date().toISOString(),
      revision: existing.project.revision,
    };
    return executeApprovalHandoff(user, {
      project: existing.project,
      auditEntry,
      eventManagerSaved: true,
      warehouseSaved: false,
    });
  }
  throw new Error('No pending approval handoff found to retry.');
}
const overlaps = (a: Brief, b: Brief, buffer = 0) =>
  Date.parse(a.start) - buffer < Date.parse(b.end) + buffer &&
  Date.parse(b.start) - buffer < Date.parse(a.end) + buffer;

function availability(brief: Brief, bookings: Project[]): Availability[] {
  const overlapping = bookings.filter(project => overlaps(brief, project.brief, day));
  return brief.requirements.map(({ assetId, quantity }) => {
    const stock = assets.find(asset => asset.id === assetId)?.stock ?? 0;
    const reserved = overlapping.reduce((sum, project) =>
      sum + (project.brief.requirements.find(item => item.assetId === assetId)?.quantity ?? 0), 0);
    const available = Math.max(0, stock - reserved);
    return { assetId, available, requested: quantity, deficit: Math.max(0, quantity - available) };
  });
}

export async function previewAudit(user: StudioUser, id: string): Promise<Audit[]> {
  return read(user).find(record => record.project.id === id)?.audit ?? [];
}

export async function previewReferences(query: string) {
  const needle = query.trim().toLowerCase();
  return [
    ...themes.map(theme => ({ title: theme.name, image: theme.image, keywords: theme.category })),
    ...assets.map(asset => ({ title: asset.name, image: asset.image, keywords: asset.category })),
  ].filter(item => `${item.title} ${item.keywords}`.toLowerCase().includes(needle))
    .map(({ title, image }) => ({ title, image, source: '' }));
}

export function previewStudio(user: StudioUser): Promise<Project[]>;
export function previewStudio(user: StudioUser, body: Extract<Action, { action: 'availability' }>): Promise<Availability[]>;
export function previewStudio(user: StudioUser, body: Extract<Action, { action: 'save' | 'approve' }>): Promise<Project>;
export function previewStudio(user: StudioUser, body: Extract<Action, { action: 'delete' }>): Promise<void>;
export async function previewStudio(user: StudioUser, body?: Action): Promise<Project[] | Project | Availability[] | void> {
  const records = read(user);
  if (!body) {
    return records
      .filter(record => record.project.status !== 'cancelled')
      .map(record => record.project);
  }
  if (body.action === 'save' && !body.id && body.eventId && records.some(record => record.project.id === body.eventId)) {
    throw new Error('This pitch has already been saved. Reopen its latest revision.');
  }

  const existing = records.find(record => record.project.id === body.id);
  const bookings = records.map(record => record.project)
    .filter(project => project.status === 'approved' && project.id !== body.id);
  if (body.action === 'availability') return availability(body.brief, bookings);

  // D01 #4 & Scenario 9: Idempotent repeat/retry of Record Client Approval resolves to the same request
  if (body.action === 'approve' && existing?.project.status === 'approved') {
    const opsWarning = Boolean(opsStore.getOperationsPersistenceWarning?.());
    const hasOrder = Boolean(
      opsStore.readOperationsStore?.()?.orderRequests?.some(o => o.eventId === existing.project.id),
    );
    if (!opsWarning && hasOrder) {
      clearPendingHandoff(user, existing.project.id);
      return existing.project;
    }
    const auditEntry = existing.audit[0] ?? {
      actor: user.name,
      action: 'Client approval recorded',
      at: existing.project.approvedAt || new Date().toISOString(),
      revision: existing.project.revision,
    };
    return executeApprovalHandoff(user, {
      project: existing.project,
      auditEntry,
      eventManagerSaved: true,
      warehouseSaved: false,
    });
  }

  if (body.id && (!existing || existing.project.revision !== body.revision)) {
    throw new Error('The pitch changed. Reload and review its latest revision.');
  }
  if (existing?.project.status === 'approved') throw new Error('Approved events are read-only.');

  const remaining = records.filter(record => record !== existing);
  if (body.action === 'delete') {
    write(user, remaining);
    return;
  }

  const now = new Date().toISOString();
  let project: Project;
  let action: string;
  if (body.action === 'save') {
    const budgetError = validateBudget(body.brief.estimatedBudget);
    if (budgetError) throw new Error(budgetError);
    project = {
      id: existing?.project.id ?? body.eventId ?? crypto.randomUUID(),
      brief: body.brief,
      status: body.status === 'ready' ? 'ready' : 'draft',
      revision: (existing?.project.revision ?? 0) + 1,
      processedBy: existing?.project.processedBy ?? user.name,
      createdAt: existing?.project.createdAt ?? now,
      updatedAt: now,
    };
    project.brief = withStockState(project.brief, availability(project.brief, bookings), project.id);
    action = existing ? 'Pitch revised' : 'Pitch created';
  } else {
    if (!existing) throw new Error('Save the pitch before recording approval.');
    const brief = existing.project.brief;
    const note = body.approvalNote.trim();
    if (!brief.pins.length || !note) throw new Error('Add a mood board and an approval note first.');
    const venue = brief.venue.trim().toLowerCase();
    if (bookings.some(booking => booking.brief.venue.trim().toLowerCase() === venue && overlaps(brief, booking.brief))) {
      throw new Error('That venue already has an approved event at this time.');
    }
    if (unconfirmedStockWarnings(brief, availability(brief, bookings)).length > 0) {
      throw new Error('Confirm replenishment requests for affected assets before recording approval.');
    }
    project = { ...existing.project, status: 'approved', revision: existing.project.revision + 1, updatedAt: now, approvedAt: now, approvalNote: note };
    action = 'Client approval recorded';
    const entry = { actor: user.name, action, at: now, revision: project.revision };
    return executeApprovalHandoff(user, {
      project,
      auditEntry: entry,
      eventManagerSaved: false,
      warehouseSaved: false,
    });
  }
  const entry = { actor: user.name, action, at: now, revision: project.revision };
  write(user, [{ project, audit: [entry, ...(existing?.audit ?? [])] }, ...remaining]);
  return project;
}

export type PendingCancellationHandoff = {
  projectId: string
  reason: string
  cancelledProject: Project
  auditEntry: Audit
  warehouseCancelled: boolean
  eventManagerSaved: boolean
}

export class CancellationHandoffError extends Error {
  handoff: PendingCancellationHandoff
  constructor(message: string, handoff: PendingCancellationHandoff) {
    super(message)
    this.name = 'CancellationHandoffError'
    this.handoff = handoff
  }
}

const pendingCancellations = new Map<string, PendingCancellationHandoff>()
const cancelSessionKey = (user: StudioUser, projectId: string) =>
  `lumiere-cancel-handoff-v1:${user.email.trim().toLowerCase()}:${projectId}`

function savePendingCancellation(user: StudioUser, handoff: PendingCancellationHandoff) {
  const key = cancelSessionKey(user, handoff.projectId)
  pendingCancellations.set(key, handoff)
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, JSON.stringify(handoff))
    }
  } catch {
    // ignore
  }
}

export function getPendingCancellationHandoff(
  user: StudioUser,
  projectId: string,
): PendingCancellationHandoff | null {
  const key = cancelSessionKey(user, projectId)
  const mem = pendingCancellations.get(key)
  if (mem) return mem
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingCancellationHandoff
    pendingCancellations.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

function clearPendingCancellation(user: StudioUser, projectId: string) {
  const key = cancelSessionKey(user, projectId)
  pendingCancellations.delete(key)
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}

function executeCancellationHandoff(
  user: StudioUser,
  handoff: PendingCancellationHandoff,
): Project {
  const next: PendingCancellationHandoff = { ...handoff }

  // 1. Cancel linked Warehouse order & release stock reservations (idempotent)
  if (!next.warehouseCancelled) {
    try {
      const hadWarning = Boolean(opsStore.getOperationsPersistenceWarning?.())
      if (hadWarning && opsStore.retryPersistOperationsStore) {
        opsStore.retryPersistOperationsStore()
      }
      if (!opsStore.getOperationsPersistenceWarning?.()) {
        const whRes = opsStore.cancelApprovedEventInWarehouse(
          next.projectId,
          { name: user.name || 'Event Manager', email: user.email },
          next.reason,
        )
        if (!whRes.ok) {
          throw new Error(whRes.error)
        }
        const hasPersistenceWarning = Boolean(opsStore.getOperationsPersistenceWarning?.())
        next.warehouseCancelled = !hasPersistenceWarning
      } else {
        next.warehouseCancelled = false
      }
    } catch (err) {
      if (
        err instanceof Error &&
        !/storage|persist|quota/i.test(err.message)
      ) {
        throw err
      }
      next.warehouseCancelled = false
    }
  }

  // 2. Mark Event Manager project as cancelled while preserving audit history
  if (!next.eventManagerSaved) {
    try {
      const currentRecords = read(user)
      const existing = currentRecords.find(r => r.project.id === next.projectId)
      if (!existing) {
        next.eventManagerSaved = true
      } else if (existing.project.status === 'cancelled') {
        next.cancelledProject = existing.project
        next.eventManagerSaved = true
      } else {
        const remaining = currentRecords.filter(r => r.project.id !== next.projectId)
        const alreadyHasAudit = existing.audit.some(
          a =>
            a.at === next.auditEntry.at &&
            a.revision === next.auditEntry.revision &&
            a.action === next.auditEntry.action,
        )
        const nextAudit = alreadyHasAudit ? existing.audit : [next.auditEntry, ...existing.audit]
        write(user, [{ project: next.cancelledProject, audit: nextAudit }, ...remaining])
        next.eventManagerSaved = true
      }
    } catch {
      next.eventManagerSaved = false
    }
  }

  if (next.warehouseCancelled && next.eventManagerSaved) {
    clearPendingCancellation(user, next.projectId)
    return next.cancelledProject
  }

  savePendingCancellation(user, next)
  const msg = !next.warehouseCancelled && !next.eventManagerSaved
    ? 'Cancellation failed: neither Warehouse reservations nor Event Manager record could be saved. Retry cancellation.'
    : !next.warehouseCancelled
      ? 'Cancellation incomplete: Event Manager record updated, but Warehouse reservation release failed to save. Retry cancellation.'
      : 'Cancellation incomplete: Warehouse reservations released, but Event Manager record could not be saved to browser storage. Retry cancellation.'
  throw new CancellationHandoffError(msg, next)
}

export async function cancelApprovedProject(
  user: StudioUser,
  projectId: string,
  reason: string,
): Promise<Project> {
  const cleanReason = reason.trim()
  if (!cleanReason) {
    throw new Error('Enter a cancellation reason before confirming.')
  }

  const pending = getPendingCancellationHandoff(user, projectId)
  if (pending) {
    return executeCancellationHandoff(user, pending)
  }

  const existing = read(user).find(r => r.project.id === projectId)
  if (!existing) throw new Error('Event record not found.')
  if (existing.project.status === 'cancelled') {
    const whRes = opsStore.cancelApprovedEventInWarehouse(
      projectId,
      { name: user.name || 'Event Manager', email: user.email },
      cleanReason,
    )
    if (!whRes.ok) throw new Error(whRes.error)
    return existing.project
  }
  if (existing.project.status !== 'approved') {
    throw new Error('Only approved events can be cancelled through this action.')
  }

  const evalRes = opsStore.evaluateApprovedEventCancellation(
    opsStore.readOperationsStore(),
    projectId,
  )
  if (!evalRes.canCancel) {
    throw new Error(
      evalRes.reason || 'Event cannot be cancelled due to downstream Warehouse activity.',
    )
  }

  const now = new Date().toISOString()
  const cancelledProject: Project = {
    ...existing.project,
    status: 'cancelled',
    updatedAt: now,
  }
  const auditEntry: Audit = {
    actor: user.name || 'Event Manager',
    action: `Approved event cancelled: ${cleanReason}`,
    at: now,
    revision: existing.project.revision,
  }

  return executeCancellationHandoff(user, {
    projectId,
    reason: cleanReason,
    cancelledProject,
    auditEntry,
    warehouseCancelled: false,
    eventManagerSaved: false,
  })
}

export async function retryCancellationHandoff(
  user: StudioUser,
  projectId: string,
): Promise<Project> {
  const pending = getPendingCancellationHandoff(user, projectId)
  if (!pending) {
    throw new Error('No pending cancellation found to retry.')
  }
  return executeCancellationHandoff(user, pending)
}
