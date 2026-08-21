// Static seed accounts for CampusHub's no-backend login simulation.
// Shape locked in 00-shared-contracts.md §3B — don't rename fields,
// authStore.js / storage.js / commentsStore.js all import this directly.
//
// 1 tier1 (site-wide admin), 3 tier2 (each scoped to a different club
// so more than one club has a working admin to test), 4 members.

export const users = [
  {
    id: "user-01",
    name: "Amara Okafor",
    email: "amara.okafor@campus.edu",
    role: "tier1",
    adminForClubs: [],
  },
  {
    id: "user-02",
    name: "Leo Fischer",
    email: "leo.fischer@campus.edu",
    role: "tier2",
    adminForClubs: ["club-01"],
  },
  {
    id: "user-03",
    name: "Priya Nair",
    email: "priya.nair@campus.edu",
    role: "tier2",
    adminForClubs: ["club-04"],
  },
  {
    id: "user-04",
    name: "Denis Mwangi",
    email: "denis.mwangi@campus.edu",
    role: "tier2",
    adminForClubs: ["club-06"],
  },
  {
    id: "user-05",
    name: "Sofia Ramirez",
    email: "sofia.ramirez@campus.edu",
    role: "member",
    adminForClubs: [],
  },
  {
    id: "user-06",
    name: "Jamal Green",
    email: "jamal.green@campus.edu",
    role: "member",
    adminForClubs: [],
  },
  {
    id: "user-07",
    name: "Yuki Tanaka",
    email: "yuki.tanaka@campus.edu",
    role: "member",
    adminForClubs: [],
  },
  {
    id: "user-08",
    name: "Nadia Haddad",
    email: "nadia.haddad@campus.edu",
    role: "member",
    adminForClubs: [],
  },
];
