import bcrypt from "bcrypt";
const password = "golden1004!";
const hash = bcrypt.hashSync(password, 10);
console.log(hash);
