GROUP 7 ENDPOINTS

| METHOD | PATH            | PURPOSE                                  | MAPS TO NEED                                              |
| ------ | --------------- | ---------------------------------------- | --------------------------------------------------------- |
| GET    | /products       | Return farming products                  | "Allows the consumers to access and buy farming products" |
| GET    | /farmer/{id}    | Return farmer's personal details         | "Needs to read aspiring farmer details"                   |
| GET    | /inventory/{id} | "Returns inventory needs during farming" | "Needs to read inventory details"                         |
| GET    | /location       | "Retrieves suitable farming locations"   | Needs to read farmer/farming locations                    |
| POST   | /farmer         | "Adds new farmer"                        | "Requires information to create a new farmer's account"   |

CampusHub (Group 7) — Agro club opportunities (v2 only)

These are our own endpoints, not a partner's. They exist only under `/v2` because
`/v1` is frozen. Every row is a local record (seeded with the club or published by
an admin); AgroConnect supplies the matched grower's details only.

| METHOD | PATH                                   | PURPOSE                                                  | WHO                                     |
| ------ | -------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| GET    | /v2/agro/opportunities                 | Upcoming farm visits, planting, harvest and volunteering | Agri club members and admins            |
| POST   | /v2/agro/opportunities                 | Publish an activity                                      | Agri club admins (tier 1 or club admin) |
| DELETE | /v2/agro/opportunities/{id}            | Remove an activity (its interest rows go with it)        | Agri club admins                        |
| POST   | /v2/agro/opportunities/{id}/interest   | Register interest; idempotent (201 first, 200 after)     | Agri club members and admins            |
| DELETE | /v2/agro/opportunities/{id}/interest   | Withdraw your own interest                               | Agri club members and admins            |
| GET    | /v2/agro/opportunities/{id}/interested | Who registered, with contact details for follow-up       | Agri club admins only                   |

Group 8 Endpoints

| METHOD | PATH         | PURPOSE                                       | MAPS TO NEED                                                                           |
| ------ | ------------ | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | /clubs       | Return club details                           | "Allows the Strath shop to access different club's details"                            |
| GET    | /clubs/{id}  | Returns specific club related to its club ID. | "Enables Strath shop users to access a club in relation to its ID making work easier." |
| GET    | /events      | "Returns specific event details               | "Allows our consumers to search events "                                               |
| GET    | /events/{id} | "Retrieves needed event ID"                   | “Allows our consumers to sign up for specific events.”                                 |
| POST   | /club        | "Adds club account"                           | "Requires information to create a new club account"                                    |
