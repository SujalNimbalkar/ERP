/**
 * Company master — the billing entities. Lives in its own module so both
 * sheetConfig (cargo form field options) and billingConfig can use it
 * without importing each other. Add a company here and every company
 * dropdown plus the Billing module picks it up.
 */

export interface CompanyProfile {
  id: string;
  name: string;
  addressLine: string;
  proprietor: string;
  mobile?: string;
  gstNo: string;
  /** Default HSN/SAC printed on the bill — editable per bill */
  defaultHsn: string;
  /** Devanagari blessing line shown above the letterhead (Sahyadri bills) */
  tagline?: string;
}

export const COMPANIES: CompanyProfile[] = [
  {
    id: "madhsa-gramin",
    name: "MADHSA GRAMIN ENTERPRISES",
    addressLine: "Jakatwadi Village, Satara Shapur, Satara - 415002",
    proprietor: "Mr. OMKAR YASHWANT SANAS",
    gstNo: "27GTXPS8509G1ZN",
    defaultHsn: "966791",
  },
  {
    id: "sahyadri-infra",
    name: "SAHYADRI INFRA",
    addressLine:
      "Ground Floor, S.No.77 4, 1A, Pileshwari Nagar, Karanje Tarf, Satara, Maharashtra 415002",
    proprietor: "Mr. Sanket Vijaykumar Shinde",
    mobile: "9503030020",
    gstNo: "27FIBPS0630E1ZI",
    defaultHsn: "966791",
    tagline: "|| श्री काळुबाई नमः ||",
  },
];

export function findCompany(id: string): CompanyProfile | undefined {
  return COMPANIES.find((c) => c.id === id);
}

export function companyName(id: string): string {
  return findCompany(id)?.name ?? id;
}

/** {value: id, label: name} pairs for company select fields. */
export const COMPANY_SELECT_OPTIONS = COMPANIES.map((c) => ({
  value: c.id,
  label: c.name,
}));
