import {Role, User, VehicleType} from "../../generated/prisma";
import bcrypt from 'bcrypt';
import {db} from '../../utils/db';


export function createDriverByEmailAndPassword(
    user:
  {
    email:string, 
    password:string,
    photo:string,
    address: string,
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
        role: Role.DRIVER,
        address: user.address,
        photo: user.photo,
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
