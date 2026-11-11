import { publishApprovedEventToWarehouse } from '../../operations/store';
import { validateBudget } from './budget';
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
  if (!body) return records.map(record => record.project);
  if (body.action === 'save' && !body.id && body.eventId && records.some(record => record.project.id === body.eventId)) {
    throw new Error('This pitch has already been saved. Reopen its latest revision.');
  }

  const existing = records.find(record => record.project.id === body.id);
  const bookings = records.map(record => record.project)
    .filter(project => project.status === 'approved' && project.id !== body.id);
  if (body.action === 'availability') return availability(body.brief, bookings);

  // D01 #4 & Scenario 9: Idempotent repeat/retry of Record Client Approval resolves to the same request
  if (body.action === 'approve' && existing?.project.status === 'approved') {
    publishApprovedEventToWarehouse(existing.project, user);
    return existing.project;
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
    // D01 & D02: Publish approved event, stock items, custom fabrication specs, and rentals to Warehouse -> Order Requests
    publishApprovedEventToWarehouse(project, user);
  }
  const entry = { actor: user.name, action, at: now, revision: project.revision };
  write(user, [{ project, audit: [entry, ...(existing?.audit ?? [])] }, ...remaining]);
  return project;
}
