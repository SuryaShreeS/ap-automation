export const COMPANIES: { id: string; name: string }[] = [
  { id: "100", name: "Alferix Trading" },
  { id: "405", name: "Alferix Sulphur" },
  { id: "410", name: "Alferix Logistics" },
  { id: "415", name: "Alferix Sulphur CAN" },
  { id: "420", name: "Alferix Sulphur Intl" },
  { id: "435", name: "Alferix Sulphur UK" },
  { id: "900", name: "Alferix Canada" },
];

export const STATUS_KEYS = [
  "UNPROCESSED", "DATA_REQUIRED", "AUTOMATCH", "AP_REVIEW", "IN_ERP",
  "MATCHED_PAY", "ERROR", "PARKED_ICEC", "PARKED_LEG", "CANCELLED", "PAID",
];

// ---- Advanced Search field catalog (shared by the Filter form and Results chips) ----
export type FieldDef = {
  key: string;
  label: string;
  kind: "select" | "text" | "num";
  wild?: boolean;
  opts?: [string, string][];
  ph?: string;
};

export const SEARCH_TABS: [string, string][] = [
  ["header", "Invoice Header"], ["lines", "Line Items"], ["notes", "Notes"], ["receipts", "PO Receipts"],
];

const coOpts: [string, string][] = [["all", "All companies"], ...COMPANIES.map((c) => [c.id, `${c.id} — ${c.name}`] as [string, string])];
const stOpts: [string, string][] = [["all", "Any status"], ...STATUS_KEYS.map((k) => [k, k] as [string, string])];

export const SEARCH_FIELDS: Record<string, FieldDef[]> = {
  header: [
    { key: "company", label: "Company", kind: "select", opts: coOpts },
    { key: "status", label: "Status", kind: "select", opts: stOpts },
    { key: "platformId", label: "Platform ID", kind: "text" },
    { key: "scanDate", label: "Scan Date", kind: "text", ph: "mm/dd/yy" },
    { key: "vendorCode", label: "Vendor Code", kind: "text" },
    { key: "vendorAddrId", label: "Vendor Address ID", kind: "text" },
    { key: "vendorLoc", label: "Vendor Location Code", kind: "text" },
    { key: "vendorName", label: "Vendor Name", kind: "text", wild: true, ph: "e.g. %sulfur%" },
    { key: "vendorAddress", label: "Vendor Address", kind: "text", wild: true },
    { key: "vendorCity", label: "Vendor City", kind: "text", wild: true },
    { key: "vendorTermDays", label: "Vendor Term Days", kind: "num" },
    { key: "payMethod", label: "Vendor Pay Method", kind: "text", ph: "ACH / CHK / WIRE" },
    { key: "poNumber", label: "PO Number", kind: "text", wild: true, ph: "e.g. P26-%" },
    { key: "invoiceNumber", label: "Invoice Number", kind: "text", wild: true, ph: "e.g. INV-884%" },
    { key: "invoiceDate", label: "Invoice Date", kind: "text", ph: "mm/dd/yy" },
    { key: "termDays", label: "Term Days", kind: "num" },
    { key: "dueDate", label: "Due Date", kind: "text", ph: "mm/dd/yy" },
    { key: "currency", label: "Currency", kind: "text", ph: "USD / CAD" },
    { key: "netTotal", label: "Net Total", kind: "num", ph: "e.g. 5000" },
    { key: "gst", label: "GST Tax", kind: "num" },
    { key: "hst", label: "HST Tax", kind: "num" },
    { key: "pst", label: "PST Tax", kind: "num" },
    { key: "usa", label: "USA Tax", kind: "num" },
    { key: "vat", label: "VAT Tax", kind: "num" },
    { key: "freight", label: "Freight Total", kind: "num" },
    { key: "grossTotal", label: "Gross Total", kind: "num" },
    { key: "vehicleId", label: "Vehicle ID", kind: "text", wild: true, ph: "e.g. SULX%" },
    { key: "bolNumber", label: "BOL Number", kind: "text", wild: true },
    { key: "routeType", label: "Route Type", kind: "select", opts: [["all", "Any route type"], ["ADHOC", "ADHOC"], ["HIERARCHY", "HIERARCHY"], ["STATIC", "STATIC"]] },
    { key: "routeName", label: "Route Name", kind: "text" },
    { key: "routeApprover", label: "Route Approver", kind: "text", wild: true },
    { key: "currentUser", label: "Current User", kind: "text", wild: true, ph: "e.g. Ivy Chen" },
    { key: "salesChannel", label: "Sales Channel", kind: "select", opts: [["all", "Any channel"], ["LIQUID", "LIQUID"], ["ACID", "ACID"], ["SOLIDS", "SOLIDS"]] },
    { key: "errorCode", label: "Error Code", kind: "text", ph: "e.g. MISSING_VENDOR" },
  ],
  lines: [
    { key: "lineDescription", label: "Description", kind: "text", wild: true },
    { key: "lineItemNumber", label: "Item Number", kind: "text" },
    { key: "lineAccountCode", label: "Account Code", kind: "text" },
    { key: "lineDivision", label: "Division", kind: "text" },
    { key: "lineSalesChannel", label: "Sales Channel", kind: "text" },
    { key: "lineBranchSite", label: "Branch Site", kind: "text" },
    { key: "lineDepartment", label: "Department", kind: "text" },
    { key: "lineProject", label: "Project", kind: "text" },
  ],
  notes: [
    { key: "noteText", label: "Note text", kind: "text", wild: true },
    { key: "noteAuthor", label: "Author", kind: "text" },
    { key: "noteDate", label: "Note date", kind: "text", ph: "mm/dd/yy" },
  ],
  receipts: [
    { key: "receiptNumber", label: "Receipt Number", kind: "text", ph: "R26-00…" },
    { key: "receiptBol", label: "BOL Number", kind: "text" },
    { key: "receiptShipDate", label: "Ship Date", kind: "text", ph: "mm/dd/yy" },
    { key: "receiptProduct", label: "Product", kind: "text" },
  ],
};

export const ALL_SEARCH_FIELDS: FieldDef[] = Object.values(SEARCH_FIELDS).flat();
export const FIELD_LABEL: Record<string, string> = {
  ...Object.fromEntries(ALL_SEARCH_FIELDS.map((f) => [f.key, f.label])),
  // Virtual workflow fields used by dashboard click-throughs.
  awaitingApproval: "Awaiting Approval",
  awaitingApReview: "AP Review Pending",
  sentLast24: "Sent to ERP <24h",
  lastDate: "Last Updated",
  queueV2: "Queue",
};

/** Search Results grid columns (label, width) — ported from the prototype resultCols. */
export const RESULT_COLS: [string, string][] = [
  ["Platform ID", "84px"], ["Scan Date", "82px"], ["Company", "128px"], ["Vendor Code", "84px"],
  ["Addr ID", "62px"], ["Loc Code", "66px"], ["Vendor Name", "168px"], ["Vendor Address", "168px"],
  ["Vendor City", "118px"], ["Term Days", "64px"], ["Pay Method", "72px"], ["PO Number", "90px"],
  ["Invoice Number", "100px"], ["Invoice Date", "80px"], ["Inv Terms", "62px"], ["Due Date", "78px"],
  ["Curr", "48px"], ["Net Total", "104px"], ["GST", "74px"], ["HST", "74px"], ["PST", "74px"],
  ["USA Tax", "74px"], ["VAT", "74px"], ["Freight", "82px"], ["Gross Total", "110px"],
  ["Vehicle ID", "96px"], ["BOL Number", "86px"], ["Route Type", "80px"], ["Route Name", "92px"],
  ["Route Approver", "122px"], ["Current User", "110px"], ["Status", "108px"], ["Sales Channel", "92px"],
];

/** Invoice Detail line-item grid columns (label, width). */
export const LINE_COLS: [string, string][] = [
  ["ID", "38px"], ["PO Number", "86px"], ["PO Line", "54px"], ["Quantity", "76px"],
  ["Description", "216px"], ["Item Number", "92px"], ["Unit Price", "78px"], ["Account Code", "84px"],
  ["Division", "60px"], ["Sales Channel", "86px"], ["Branch Site", "72px"], ["Department", "76px"],
  ["Project", "58px"], ["Line Amount", "96px"],
];

/** Receipt Matching line grid columns (label, width). */
export const MATCH_COLS: [string, string][] = [
  ["Source", "60px"], ["Number", "94px"], ["Line", "40px"], ["Product", "72px"], ["Description", "168px"],
  ["Product Type", "84px"], ["Unit", "40px"], ["Invoiced Qty", "84px"], ["Net Price", "74px"],
  ["Line Amount - Tax", "106px"], ["Currency", "56px"], ["Match Status", "86px"], ["Shipment Date", "92px"],
  ["BOL #", "86px"], ["Vehicle Number", "96px"],
];
