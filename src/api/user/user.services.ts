import {User} from "../../generated/prisma";
import bcrypt from 'bcrypt';
import {db} from '../../utils/db';

export function findUserByEmail(email:string) {
  return db.user.findUnique({
    where: {
      email,
    },
  });
}

export function createUserByEmailAndPassword(user:{email:string, password:string}) {
  user.password = bcrypt.hashSync(user.password, 12);
  return db.user.create({
    data: user,
  });
}

export function findUserById(id:any) {
  return db.user.findUnique({
    where: {
      id,
    },
  });
}

