// Thematic groupings of MapPLUTO columns, for people less familiar with the dataset.
// Columns not listed here (e.g. ones DCP adds in a future release) land in "Other".

export interface FieldGroup {
  id: string
  label: string
  hint: string
  fields: string[]
}

export const FIELD_GROUPS: FieldGroup[] = [
  {
    id: 'id',
    label: 'Lot identifiers & address',
    hint: 'BBL, address, and coordinates. Usually worth including.',
    fields: ['bbl', 'borough', 'borocode', 'block', 'lot', 'address', 'zipcode', 'latitude', 'longitude', 'xcoord', 'ycoord'],
  },
  {
    id: 'owner',
    label: 'Ownership',
    hint: 'Who owns the lot',
    fields: ['ownername', 'ownertype', 'condono'],
  },
  {
    id: 'building',
    label: 'Buildings',
    hint: 'Building type, size, age, and units',
    fields: ['bldgclass', 'landuse', 'numbldgs', 'numfloors', 'unitsres', 'unitstotal', 'yearbuilt', 'yearalter1', 'yearalter2', 'bldgfront', 'bldgdepth', 'ext', 'proxcode', 'bsmtcode'],
  },
  {
    id: 'area',
    label: 'Floor area by use',
    hint: 'Square footage: residential, office, retail, and more',
    fields: ['bldgarea', 'resarea', 'comarea', 'officearea', 'retailarea', 'garagearea', 'strgearea', 'factryarea', 'otherarea', 'areasource'],
  },
  {
    id: 'lot',
    label: 'Lot dimensions',
    hint: 'Lot size and shape',
    fields: ['lotarea', 'lotfront', 'lotdepth', 'lottype', 'irrlotcode', 'easements'],
  },
  {
    id: 'zoning',
    label: 'Zoning',
    hint: 'Zoning districts, overlays, special districts, and housing programs',
    fields: ['zonedist1', 'zonedist2', 'zonedist3', 'zonedist4', 'overlay1', 'overlay2', 'spdist1', 'spdist2', 'spdist3', 'ltdheight', 'splitzone', 'zonemap', 'zmcode', 'edesignum', 'mihoption1', 'mihoption2', 'mihoption3', 'mihoption4', 'trnstzone'],
  },
  {
    id: 'far',
    label: 'Density (FAR)',
    hint: 'Built vs. maximum allowed floor area ratio',
    fields: ['builtfar', 'residfar', 'commfar', 'facilfar', 'affresfar', 'manufar'],
  },
  {
    id: 'value',
    label: 'Assessed value',
    hint: 'Department of Finance assessments and exemptions',
    fields: ['assessland', 'assesstot', 'exempttot'],
  },
  {
    id: 'districts',
    label: 'Districts & census geography',
    hint: 'Community, council, school, police, fire, sanitation, and census areas',
    fields: ['cd', 'council', 'schooldist', 'policeprct', 'firecomp', 'healtharea', 'healthcenterdistrict', 'sanitboro', 'sanitdistrict', 'sanitsub', 'bct2020', 'bctcb2020', 'ct2010', 'cb2010', 'tract2010'],
  },
  {
    id: 'heritage',
    label: 'Landmarks & flood risk',
    hint: 'Historic districts, landmarks, and FEMA floodplains',
    fields: ['histdist', 'landmark', 'firm07_flag', 'pfirm15_flag'],
  },
  {
    id: 'meta',
    label: 'Records & data notes',
    hint: 'Apportionment history, map references, and dataset bookkeeping',
    fields: ['appbbl', 'appdate', 'sanborn', 'taxmap', 'plutomapid', 'dcpedited', 'notes', 'version'],
  },
]

/** Group the given fields by theme, keeping each group's curated order, plus an "Other" bucket. */
export function groupFields<T extends { name: string }>(fields: T[]): { group: FieldGroup; fields: T[] }[] {
  const byName = new Map(fields.map((f) => [f.name, f]))
  const used = new Set<string>()
  const out = FIELD_GROUPS.map((group) => {
    const list = group.fields.map((n) => byName.get(n)).filter((f): f is T => !!f)
    list.forEach((f) => used.add(f.name))
    return { group, fields: list }
  })
  const rest = fields.filter((f) => !used.has(f.name))
  if (rest.length) out.push({ group: { id: 'other', label: 'Other', hint: 'Not yet categorized', fields: [] }, fields: rest })
  return out.filter((g) => g.fields.length > 0)
}
