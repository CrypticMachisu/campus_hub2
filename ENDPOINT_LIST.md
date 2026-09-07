GROUP 7 ENDPOINTS

| METHOD | PATH            | PURPOSE                                  | MAPS TO NEED                                              |
| ------ | --------------- | ---------------------------------------- | --------------------------------------------------------- |
| GET    | /products       | Return farming products                  | "Allows the consumers to access and buy farming products" |
| GET    | /farmer/{id}    | Return farmer's personal details         | "Needs to read aspiring farmer details"                   |
| GET    | /inventory/{id} | "Returns inventory needs during farming" | "Needs to read inventory details"                         |
| GET    | /location       | "Retrieves suitable farming locations"   | Needs to read farmer/farming locations                    |
| POST   | /farmer         | "Adds new farmer"                        | "Requires information to create a new farmer's account"   |

Group 8 Endpoints

| METHOD | PATH         | PURPOSE                                       | MAPS TO NEED                                                                           |
| ------ | ------------ | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | /clubs       | Return club details                           | "Allows the Strath shop to access different club's details"                            |
| GET    | /clubs/{id}  | Returns specific club related to its club ID. | "Enables Strath shop users to access a club in relation to its ID making work easier." |
| GET    | /events      | "Returns specific event details               | "Allows our consumers to search events "                                               |
| GET    | /events/{id} | "Retrieves needed event ID"                   | “Allows our consumers to sign up for specific events.”                                  |
| POST   | /club        | "Adds club account"                           | "Requires information to create a new club account"                                    |
