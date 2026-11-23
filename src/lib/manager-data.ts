export type InventoryStatus = "Available" | "Reserved" | "Sold"

export type Phone = {
  id: number
  model: string
  storage: string
  colour: string
  condition: "Excellent" | "Good" | "Fair"
  battery: number
  imei: string
  cost: number
  price: number
  status: InventoryStatus
  addedAt: string
}

export type PaymentStatus = "Verified" | "Awaiting verification" | "Partially verified"
export type SaleStatus = "Completed" | "Pending" | "Partially paid"

export type Sale = {
  id: string
  date: string
  time: string
  employee: string
  customer: string
  phone: string
  model: string
  imei: string
  total: number
  cost: number
  received: number
  method: "Cash" | "MTN MoMo" | "Other Mobile Money" | "Bank Transfer" | "Card" | "Split"
  status: SaleStatus
  paymentStatus: PaymentStatus
  references: string[]
}

export type EmployeeRole = "Manager" | "Senior Sales Associate" | "Sales Associate" | "Inventory Specialist"
export type EmployeeStatus = "Active" | "Away" | "Inactive"

export type EmployeeActivity = {
  action: string
  detail: string
  time: string
}

export type Employee = {
  id: string
  name: string
  initials: string
  email: string
  phone: string
  role: EmployeeRole
  status: EmployeeStatus
  joined: string
  lastActive: string
  permissions: string[]
  sales: number
  revenue: number
  conversion: number
  averageSale: number
  activity: EmployeeActivity[]
}

export type ApprovalType =
  | "Refund"
  | "Sale cancellation"
  | "Discount"
  | "Trade-in"
  | "Inventory adjustment"

export type ApprovalStatus = "Pending" | "Approved" | "Declined"

export type Approval = {
  id: string
  type: ApprovalType
  title: string
  description: string
  requestedBy: string
  requestedAt: string
  amount?: number
  reference: string
  status: ApprovalStatus
  priority: "Normal" | "High"
  reason: string
  device?: string
  imei?: string
}

export const inventoryPhones: Phone[] = [
  { id: 1, model: "iPhone 15 Pro", storage: "256GB", colour: "Natural Titanium", condition: "Excellent", battery: 92, imei: "356789104567890", cost: 7200, price: 8500, status: "Available", addedAt: "21 Nov 2026" },
  { id: 2, model: "iPhone 14 Pro", storage: "128GB", colour: "Deep Purple", condition: "Excellent", battery: 89, imei: "356789104567891", cost: 6100, price: 7200, status: "Available", addedAt: "20 Nov 2026" },
  { id: 3, model: "iPhone 13", storage: "128GB", colour: "Midnight", condition: "Good", battery: 86, imei: "356789104567892", cost: 4000, price: 4900, status: "Reserved", addedAt: "18 Nov 2026" },
  { id: 4, model: "iPhone 15", storage: "128GB", colour: "Pink", condition: "Excellent", battery: 96, imei: "356789104567893", cost: 5700, price: 6800, status: "Available", addedAt: "22 Nov 2026" },
  { id: 5, model: "iPhone 14", storage: "128GB", colour: "Blue", condition: "Good", battery: 84, imei: "356789104567894", cost: 4400, price: 5300, status: "Sold", addedAt: "14 Nov 2026" },
  { id: 6, model: "iPhone 13 Pro", storage: "256GB", colour: "Sierra Blue", condition: "Good", battery: 88, imei: "356789104567895", cost: 4850, price: 5900, status: "Available", addedAt: "17 Nov 2026" },
  { id: 7, model: "iPhone 16 Pro", storage: "256GB", colour: "Desert Titanium", condition: "Excellent", battery: 100, imei: "356789104567896", cost: 10100, price: 11800, status: "Reserved", addedAt: "23 Nov 2026" },
  { id: 8, model: "iPhone 12", storage: "64GB", colour: "Black", condition: "Fair", battery: 79, imei: "356789104567897", cost: 2450, price: 3200, status: "Available", addedAt: "12 Nov 2026" },
]

export const sales: Sale[] = [
  { id: "ME-2026-1048", date: "23 Nov 2026", time: "10:42 AM", employee: "Alex Morgan", customer: "Daniel Mensah", phone: "iPhone 15 Pro · 256GB", model: "iPhone 15 Pro", imei: "352099104567810", total: 8500, cost: 7200, received: 8500, method: "MTN MoMo", status: "Completed", paymentStatus: "Verified", references: ["MM-83920114"] },
  { id: "ME-2026-1047", date: "23 Nov 2026", time: "11:18 AM", employee: "Sarah Owusu", customer: "Ama Boateng", phone: "iPhone 14 Pro · 128GB", model: "iPhone 14 Pro", imei: "352099104567811", total: 7200, cost: 6100, received: 5000, method: "Split", status: "Partially paid", paymentStatus: "Partially verified", references: ["CASH-1047-A", "MM-83920208"] },
  { id: "ME-2026-1046", date: "22 Nov 2026", time: "03:25 PM", employee: "Alex Morgan", customer: "Kwame Asante", phone: "iPhone 13 · 128GB", model: "iPhone 13", imei: "352099104567812", total: 4900, cost: 4000, received: 4900, method: "Bank Transfer", status: "Completed", paymentStatus: "Verified", references: ["BT-992781"] },
  { id: "ME-2026-1045", date: "22 Nov 2026", time: "01:06 PM", employee: "Michael Addo", customer: "Nana Yeboah", phone: "iPhone 15 · 128GB", model: "iPhone 15", imei: "352099104567813", total: 6800, cost: 5700, received: 0, method: "Card", status: "Pending", paymentStatus: "Awaiting verification", references: ["CARD-PENDING-445"] },
  { id: "ME-2026-1044", date: "21 Nov 2026", time: "04:51 PM", employee: "Sarah Owusu", customer: "Esi Agyeman", phone: "iPhone 14 · 128GB", model: "iPhone 14", imei: "356789104567894", total: 5300, cost: 4400, received: 5300, method: "Cash", status: "Completed", paymentStatus: "Verified", references: ["CASH-1044"] },
  { id: "ME-2026-1043", date: "21 Nov 2026", time: "12:32 PM", employee: "Michael Addo", customer: "Kojo Frimpong", phone: "iPhone 13 Pro · 256GB", model: "iPhone 13 Pro", imei: "352099104567815", total: 5900, cost: 4850, received: 3000, method: "MTN MoMo", status: "Partially paid", paymentStatus: "Partially verified", references: ["MM-83919875"] },
  { id: "ME-2026-1042", date: "20 Nov 2026", time: "02:14 PM", employee: "Sarah Owusu", customer: "Akosua Tetteh", phone: "iPhone 12 · 64GB", model: "iPhone 12", imei: "352099104567816", total: 3200, cost: 2450, received: 3200, method: "Other Mobile Money", status: "Completed", paymentStatus: "Verified", references: ["VODA-238873"] },
  { id: "ME-2026-1041", date: "19 Nov 2026", time: "09:38 AM", employee: "Alex Morgan", customer: "Yaw Ofori", phone: "iPhone 16 Pro · 256GB", model: "iPhone 16 Pro", imei: "352099104567817", total: 11800, cost: 10100, received: 11800, method: "Card", status: "Completed", paymentStatus: "Verified", references: ["CARD-929018"] },
]

export const employees: Employee[] = [
  {
    id: "alex-morgan", name: "Alex Morgan", initials: "AM", email: "alex@mac-evra.example", phone: "+233 24 555 0101", role: "Manager", status: "Active", joined: "12 Mar 2024", lastActive: "Now", permissions: ["Complete sales", "Manage inventory", "Manage employees", "Review approvals", "View reports", "Edit settings"], sales: 38, revenue: 241500, conversion: 72, averageSale: 6355,
    activity: [
      { action: "Completed sale", detail: "ME-2026-1048 · iPhone 15 Pro", time: "12 min ago" },
      { action: "Approved adjustment", detail: "Battery health correction for IMEI …7892", time: "1 hr ago" },
      { action: "Updated inventory", detail: "Added iPhone 16 Pro to stock", time: "3 hrs ago" },
    ],
  },
  {
    id: "sarah-owusu", name: "Sarah Owusu", initials: "SO", email: "sarah@mac-evra.example", phone: "+233 55 555 0102", role: "Senior Sales Associate", status: "Active", joined: "08 Jul 2024", lastActive: "8 min ago", permissions: ["Complete sales", "Reserve devices", "Request discounts", "Process trade-ins", "View own performance"], sales: 34, revenue: 218800, conversion: 68, averageSale: 6435,
    activity: [
      { action: "Requested discount", detail: "GH₵ 350 on iPhone 14 Pro", time: "46 min ago" },
      { action: "Recorded split payment", detail: "ME-2026-1047 · GH₵ 5,000 verified", time: "1 hr ago" },
      { action: "Reserved device", detail: "iPhone 13 · IMEI ending 7892", time: "Yesterday" },
    ],
  },
  {
    id: "michael-addo", name: "Michael Addo", initials: "MA", email: "michael@mac-evra.example", phone: "+233 20 555 0103", role: "Sales Associate", status: "Away", joined: "19 Jan 2025", lastActive: "42 min ago", permissions: ["Create sales", "Reserve devices", "Request discounts", "Request cancellations", "View own performance"], sales: 27, revenue: 161900, conversion: 61, averageSale: 5996,
    activity: [
      { action: "Submitted payment", detail: "Card confirmation pending for ME-2026-1045", time: "42 min ago" },
      { action: "Requested cancellation", detail: "Customer changed purchase choice", time: "2 hrs ago" },
      { action: "Started sale", detail: "iPhone 13 Pro · customer Kojo Frimpong", time: "2 days ago" },
    ],
  },
  {
    id: "adwoa-boateng", name: "Adwoa Boateng", initials: "AB", email: "adwoa@mac-evra.example", phone: "+233 27 555 0104", role: "Inventory Specialist", status: "Active", joined: "03 Sep 2025", lastActive: "14 min ago", permissions: ["Add inventory", "Reserve devices", "Request inventory adjustments", "View inventory history"], sales: 4, revenue: 21800, conversion: 55, averageSale: 5450,
    activity: [
      { action: "Added inventory", detail: "3 devices received and IMEIs checked", time: "14 min ago" },
      { action: "Requested adjustment", detail: "Battery health correction from 82% to 79%", time: "1 hr ago" },
      { action: "Completed stock count", detail: "48 physical devices reconciled", time: "Yesterday" },
    ],
  },
  {
    id: "kwesi-mensah", name: "Kwesi Mensah", initials: "KM", email: "kwesi@mac-evra.example", phone: "+233 59 555 0105", role: "Sales Associate", status: "Inactive", joined: "14 Feb 2025", lastActive: "18 Nov 2026", permissions: ["Create sales", "Reserve devices", "Request discounts", "View own performance"], sales: 19, revenue: 112400, conversion: 58, averageSale: 5916,
    activity: [
      { action: "Signed out", detail: "End of scheduled shift", time: "18 Nov 2026" },
      { action: "Completed sale", detail: "iPhone 14 · Cash payment", time: "18 Nov 2026" },
      { action: "Reserved device", detail: "iPhone 15 · 128GB", time: "17 Nov 2026" },
    ],
  },
]

export const initialApprovals: Approval[] = [
  { id: "APR-2051", type: "Discount", title: "GH₵ 350 sale discount", description: "Discount requested to match a verified competing offer.", requestedBy: "Sarah Owusu", requestedAt: "23 Nov 2026 · 10:56 AM", amount: 350, reference: "ME-2026-1047", status: "Pending", priority: "Normal", reason: "Customer presented a current written offer from another Accra retailer.", device: "iPhone 14 Pro · 128GB", imei: "352099104567811" },
  { id: "APR-2050", type: "Inventory adjustment", title: "Correct battery health", description: "Change battery health from 82% to 79% after a second diagnostic.", requestedBy: "Adwoa Boateng", requestedAt: "23 Nov 2026 · 10:12 AM", reference: "INV-ADJ-190", status: "Pending", priority: "Normal", reason: "The first intake reading was recorded before diagnostics completed.", device: "iPhone 12 · 64GB", imei: "356789104567897" },
  { id: "APR-2049", type: "Sale cancellation", title: "Cancel unpaid sale", description: "Release the reserved device and void the unpaid transaction.", requestedBy: "Michael Addo", requestedAt: "23 Nov 2026 · 9:44 AM", amount: 6800, reference: "ME-2026-1045", status: "Pending", priority: "High", reason: "Customer changed their device choice before payment was confirmed.", device: "iPhone 15 · 128GB", imei: "352099104567813" },
  { id: "APR-2048", type: "Refund", title: "Refund verified card payment", description: "Customer reports intermittent display issues within the return window.", requestedBy: "Alex Morgan", requestedAt: "22 Nov 2026 · 4:18 PM", amount: 5300, reference: "ME-2026-1038", status: "Pending", priority: "High", reason: "Device has passed intake but the issue was reproduced twice at the store.", device: "iPhone 14 · 128GB", imei: "352099104567801" },
  { id: "APR-2047", type: "Trade-in", title: "Approve trade-in value", description: "Final inspection supports the quoted trade-in allowance.", requestedBy: "Sarah Owusu", requestedAt: "22 Nov 2026 · 2:05 PM", amount: 2100, reference: "TRD-2026-188", status: "Approved", priority: "Normal", reason: "iPhone 12 Pro, 128GB, 83% battery, all checks passed.", device: "iPhone 12 Pro · 128GB", imei: "359991104560118" },
  { id: "APR-2046", type: "Discount", title: "GH₵ 800 sale discount", description: "Requested discount exceeds the approved floor price.", requestedBy: "Michael Addo", requestedAt: "21 Nov 2026 · 11:31 AM", amount: 800, reference: "ME-2026-1032", status: "Declined", priority: "High", reason: "Customer requested a large discount without a qualifying promotion.", device: "iPhone 16 Pro · 256GB", imei: "352099104567799" },
]

export const reportPeriods = {
  daily: {
    label: "Today · 23 Nov 2026",
    revenue: 15700,
    collected: 13500,
    outstanding: 2200,
    profit: 2400,
    margin: 15.3,
    transactions: 2,
    trend: [3200, 6100, 4900, 7200, 8500, 5300, 15700],
    trendLabels: ["17 Nov", "18 Nov", "19 Nov", "20 Nov", "21 Nov", "22 Nov", "Today"],
  },
  weekly: {
    label: "17–23 Nov 2026",
    revenue: 53600,
    collected: 48500,
    outstanding: 5100,
    profit: 8650,
    margin: 16.1,
    transactions: 9,
    trend: [3200, 6100, 4900, 7200, 8500, 5300, 15700],
    trendLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  monthly: {
    label: "November 2026",
    revenue: 734600,
    collected: 708200,
    outstanding: 26400,
    profit: 119850,
    margin: 16.3,
    transactions: 118,
    trend: [142000, 168500, 184300, 239800],
    trendLabels: ["Week 1", "Week 2", "Week 3", "Week 4"],
  },
} as const

export const employeeReport = [
  { name: "Alex Morgan", sales: 38, revenue: 241500, share: 33 },
  { name: "Sarah Owusu", sales: 34, revenue: 218800, share: 30 },
  { name: "Michael Addo", sales: 27, revenue: 161900, share: 22 },
  { name: "Kwesi Mensah", sales: 19, revenue: 112400, share: 15 },
]

export const modelReport = [
  { name: "iPhone 15 Pro", units: 28, revenue: 238000, share: 32 },
  { name: "iPhone 14 Pro", units: 26, revenue: 187200, share: 25 },
  { name: "iPhone 15", units: 24, revenue: 163200, share: 22 },
  { name: "iPhone 13", units: 22, revenue: 107800, share: 15 },
  { name: "Other models", units: 18, revenue: 38400, share: 6 },
]

export const paymentReport = [
  { name: "MTN MoMo", amount: 264500, transactions: 42, share: 36 },
  { name: "Cash", amount: 198300, transactions: 35, share: 27 },
  { name: "Bank Transfer", amount: 132200, transactions: 17, share: 18 },
  { name: "Card", amount: 102800, transactions: 15, share: 14 },
  { name: "Other Mobile Money", amount: 36800, transactions: 9, share: 5 },
]

export const money = (value: number) => `GH₵ ${value.toLocaleString("en-GH")}`
