| METHOD | PATH            | PURPOSE                                  | MAPS TO NEED                                              |
| ------ | --------------- | ---------------------------------------- | --------------------------------------------------------- |
| GET    | /products       | Return farming products                  | "Allows the consumers to access and buy farming products" |
| GET    | /farmer/{id}    | Return farmer's personal details         | "Needs to read aspiring farmer details"                   |
| GET    | /inventory/{id} | "Returns inventory needs during farming" | "Needs to read inventory details"                         |
| GET    | /location       | "Retrieves suitable farming locations"   | Needs to read farmer/farming locations                    |
| POST   | /farmer         | "Adds new farmer"                        | "Requires information to create a new farmer's account"   |

GROUP 7 ENDPOINTS