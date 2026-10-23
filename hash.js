const bcrypt = require("bcrypt");
const fs = require("fs");

const saltRounds = 10;
const hashedPassword = bcrypt.hashSync("1177", saltRounds);

fs.writeFileSync("hashed.txt", hashedPassword);

// Phishing attack