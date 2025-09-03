import {Role, Sex, User, VehicleType} from "../../generated/prisma";
import bcrypt from 'bcrypt';
import {db} from '../../utils/db';


export function createDriverByEmailAndPassword(
    user:
  {
    email: string;
    password: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
    sex: Sex;
    dateOfBirth: Date;
    photo: string;
    address: string;
    wilaya: string;
    commune: string;
    vehicle: {
      type: VehicleType;
      model: string;
      year: number;
      plate: string;
    };

  }) {
  user.password = bcrypt.hashSync(user.password, 12);
  return db.user.create({
    data: {
        email: user.email,
        password: user.password,
        phoneNumber: user.phoneNumber,
      role: Role.DRIVER,
      firstName: user.firstName,
      lastName: user.lastName,
      sex: user.sex,
      dateOfBirth: user.dateOfBirth,
      photo: user.photo,
      address: user.address,
      wilaya: user.wilaya,
      commune: user.commune,
        driverProfile: {
            create: {
                vehicles:{
                    create: [{
                        type: user.vehicle.type,
                        model: user.vehicle.model,
                        year: user.vehicle.year,
                        plate: user.vehicle.plate,
                    }]
                }
            }
        }
    },
    include: {
        driverProfile: {
            include :{
                vehicles: true
            }
        }
    }
  });
}


export function findDriverById(id:any) {
  return db.user.findUnique({
    where: {
      id,
    },
    include:{
      driverProfile: {
        include: {
          vehicles: true
        }
      }
    }
  });
}
