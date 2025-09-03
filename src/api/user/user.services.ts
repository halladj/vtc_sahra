import {Role, User} from "../../generated/prisma";
import bcrypt from 'bcrypt';
import {db} from '../../utils/db';

export function findUserByEmail(email:string) {
  return db.user.findUnique({
    where: {
      email,
    },
  });
}

export function createUserByEmailAndPassword(user:
  {
    email:string, 
    password:string,
    role: Role,
    photo:string,
    address: string
  }) {
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

export function updateUsersPassword(
  userId:string, 
  hashedPassword:string) {
    return db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
}

export function updateUserPhoto(userId:string, photoUrl:string) {
  return db.user.update({
    where: {id: userId},
    data: {photo: photoUrl}
  })
}


export function updateUser(
  userId: string, 
  data: Partial<{
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    phoneNumber: string;
    address: string;
    wilaya: string;
    commune: string;
    language: string;
  }>
) {
  return db.user.update({
    where: {id: userId},
    data
  });
}