import {Role, Sex, User, VehicleType} from "@prisma/client";
import bcrypt from 'bcrypt';
import {db} from '../../utils/db';


export function createDriverByEmailAndPassword( user:
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


export function findDriverById(driverId:any) {
  return db.user.findUnique({
    where: {
      id:driverId,
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

export function addVehicleForDriver(driverId:string,
  vehicle: {
    type: VehicleType,
    model: string,
    year: number,
    plate: string
  }
) {
  return db.vehicle.create({
    data: {
      driverId: driverId,
      type: vehicle.type,
      model: vehicle.model,
      plate: vehicle.plate,
      year: vehicle.year
    }
  })
}

export function updateVehicle(driverId: string,
  vehicleId: string, 
  vehicle:  Partial<{
    model: string,
    type: VehicleType,
    year: number,
    plate: string
  }>) {
    return db.vehicle.update({
      where: {id: vehicleId, driverId:driverId},
      data: vehicle
    });
}

export function deleteVehicleForDriver(driverId:string,
  vehicleId: string
) {
  return db.vehicle.delete({
    where: {id: vehicleId, driverId:driverId}
  });
}

export function getAllVehiclesForDriver(driverId:string) {
  return db.vehicle.findMany({
    where: {driverId: driverId}
  });
}