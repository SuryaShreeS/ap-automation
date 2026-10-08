# Sage X3 ↔ Blue Creek integration contract (from Symantha's samples, Jul 2026)

Source: two emails from Symantha Schaeffer — *"Sample of Exports from Sage to BlueCreek"* (12
feed files) and *"Sample of Import into Sage from BlueCreek"* (1 import file + screenshots).
Today these move **hourly over SFTP** as pipe-delimited text, exports covering a rolling
**90-day window** (per the walkthrough call). The new platform replaces each file with a live
Sage API call (FR-82) — this document is the field-level contract for that work.

Raw samples are NOT committed (the vendor master alone holds 2,686 real vendor records);
only inferred layouts and a sanitized row or two appear below. Originals: the two `.msg`
files in `Downloads`.

Field layouts are **inferred from samples** — confirm with Net at Work before build.

---

## Exports — Sage → Blue Creek (reads; become live API lookups)

### Reference lists (drive dropdowns — our List Administration mirrors these)
Common shape: `*|code|label|extra|ACTIVE/INACTIVE`

| File | Contents | Platform surface |
|---|---|---|
| `Account_*.txt` | GL accounts (`11001` Wells Fargo-DDA…) | line-coding Account Code |
| `Department_*.txt` | `000` COGS, `110` Operations… | Department list |
| `Division_*.txt` | `10` Corporate, `13` Sulphur, `40` ICEC… | Division list |
| `Project_*.txt` | `B01`…, `I403` Chevron Settlement… | Project list |
| `SalesChannel_*.txt` | `30` Sulphur, `41` Solid Sulphur, `42` Sulfuric Acid, `43` Liquid Sulphur… | Sales Channel (note: real codes are numeric, richer than Liquid/Acid/Solids) |
| `Sites_*.txt` | `13100` Wilmington, `13200` Stockton, `40500` Woodlands… | Branch Site list |

### `Vendor_*.txt` — vendor/BP master (2,686 rows)
```
*|code|code|addrId|payAddrId|name|addr1|addr2|addr3|city|state|zip|country|termDays|category|?|Y|Y|currency|payCurrency|payMethod|remitNote|…|status
*|1100002|1100002|R01|R01|Seaboard Farms Inc.|Dept 1180|PO Box 121180||Dallas|TX|75312|US|7|Raw Material|N|Y|Y|USD|USD|ACH|Remit: Dallas|||||ACTIVE
```
Notable: vendor codes are **numeric** (`1100002`), address IDs are `R01`/`H01`/`B01` style,
pay methods include `ACH`, `WTR` (wire). → live read at extraction time (FR-22).

### `POHeader_*.txt` (9,084 rows)
```
company|poNumber|rev|vendor|addrId|orderDate|amount|…|amount|currency|buyer|?|Order|||status
100|P000037|0|1100007|R01|20190204|1546831|0|0|0|1546831|USD|XSOTR||Order|||OPEN
```
PO numbers: current format **`P` + 2-digit year + `-` + 6-digit zero-padded seq**
(`P26-005941`); legacy formats exist (`P000037`, `P19-000126`). Latest in sample: `P26-005941`.

### `PO_Line_ShipmentLine_*.txt` (29,725 rows)
```
company|po|rev|line|?|Normal|R|site|matchType|product|desc|qty|price|price|unit|?|lineAmt|amt|QUANTITY|account|division|salesChannel|site|dept|||shipDate|BOL/vehicle|?|status
100|P21-015911|0|1000|1|Normal|R|13300|3-Way|D10014|Sulphur Drop Ship|20|17.37|17.37|LT|105|2100|1823.85|QUANTITY|24501|13|30|13300|000|||20210826|943047||CLOSED
```
Carries **match type (2-Way/3-Way)** per line, the full coding block
(account/division/channel/site/dept), and the **ship date + BOL** pair — the unique match key
(FR-31). Lines number 1000/2000/3000….

### `POReceipt_*.txt` (21,047 rows)
```
company|po|poLine|rev|?|receiptNo|receiptNo|recLine|qtyLbs|conv|qtyLT|amount|?|receiptDate|?|seq|?|invoicedDate|?|status
100|P26-005941|1000|0|1|R26-007981|R26-007981|1000|51640|0.2967|23.075|15321.588|0|20260414||55734||20260430||CLOSED
```
Receipt numbers `R26-######` (matches our seed style). Receipts drive GL — matching is
receipt-level (FR-35).

### `InvoiceValidation_*.txt` (9,991 rows) — Sage's write-back after import
```
company|platformId|vendor|addrId|invoiceNumber|SUCCESS|amount|docNumber|
405|219956|1100091|R01|2025SUL-03|SUCCESS|15473.78|PIN196765|
415|221252|40500S|R01|DIR007195Credit|SUCCESS|-438517.84|PCM004205|
```
Confirms Sage document creation: invoices become **`PIN######`** (e.g. `PIN196765`), credits
**`PCM######`** — and the **platform ID travels on the PIN** (this is our `erp_voucher`
write-back + the credit-chain static field Symantha described).

### `PaymentStatus_*.txt` (8,882 rows) — payment feedback
```
company|?|vendorRef|addrId|checkRef|PAYMENT|payDate|amount|currency|paymentNumber|
100||3000356|R01|19H3-KYQC-FDPW|PAYMENT|20250422|41.81|USD|PAYAC023358|
```
Payment numbers are **prefixed by method**: `PAYAC` (ACH), `PAYWT` (wire), `PAYEF` (EFT),
`PAYDD` (direct debit). → our Paid step / payment fields (FR-73).

---

## Import — Blue Creek → Sage: `InvoicesIntoERP_<ts>_NONPO_<platformId>.txt`
One file per invoice, filename carries PO/NONPO flag + platform ID.
```
company|vendor|addrId|invoiceNumber|invoiceDate|account|division|salesChannel|site|dept|?|?|dueDate|net|currency|gross|?|?|platformId|…|lineNo|lineAmount|description|?|NONPO|INVOICE|…
100|3000085|R01|3147259-0051-3|20250703|75104|13|41|13200|000|||20250703|561.82|USD|561.82|||232563|||||||||1|561.82|MISCELLANEOUS||NONPO|INVOICE||||||||
```
→ replaced by the platform's **PIN-create API call with attachment** (FR-13); the
`InvoiceValidation` + `PaymentStatus` round-trips become synchronous API responses/webhooks,
removing the hourly cadence and the 90-day lookback limit.

---

## Platform alignment (done)
The mock Sage seam + engine now emit the **real formats**: new POs `P26-005942`-style
(zero-padded increment of the sample's last real PO `P26-005941`), vouchers `PIN######`,
credits `PCM######`, payments `PAYAC/PAYWT/PAYCK######` by pay method.

## Open items for the real adapter
- Confirm inferred field positions with Net at Work / Sage schema docs.
- Vendor codes & address IDs in our demo seed are still `BP-xxxxx`/`MAIN` style — swap the
  seed to real-style codes (`1100002`, `R01`) in the next data-alignment pass.
- Sales-channel codes are numeric in Sage (30/41/42/43…) vs. our LIQUID/ACID/SOLIDS labels —
  needs the mapping table (open question #3, owner Symantha).
- Clarify whether the PO sequence is global or per-vendor before finalizing FR-38 (PRD §9).
