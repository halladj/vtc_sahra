import { Role, Sex, User, VehicleType } from "@prisma/client";
import bcrypt from 'bcrypt';
import { db } from '../../utils/db';


export function createDriverByEmailAndPassword(user:
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

  // Create driver, driver profile, vehicle, and wallet in a transaction
  return db.$transaction(async (tx) => {
    const newDriver = await tx.user.create({
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
            vehicles: {
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
          include: {
            vehicles: true
          }
        }
      }
    });

    // Create wallet for the new driver
    await tx.wallet.create({
      data: {
        userId: newDriver.id,
        balance: 0,
      },
    });

    return newDriver;
  });
}

export function findDriverById(driverId: any) {
  return db.user.findUnique({
    where: {
      id: driverId,
    },
    include: {
      driverProfile: {
        include: {
          vehicles: true
        }
      }
    }
  });
}

export async function addVehicleForDriver(userId: string,
  vehicle: {
    type: VehicleType,
    model: string,
    year: number,
    plate: string
  }
) {
  // Get the driver profile ID from the user ID
  const driverProfile = await db.driverProfile.findUnique({
    where: { userId: userId }
  });

  if (!driverProfile) {
    throw new Error('Driver profile not found');
  }

  return db.vehicle.create({
    data: {
      driverId: driverProfile.id,
      type: vehicle.type,
      model: vehicle.model,
      plate: vehicle.plate,
      year: vehicle.year
    }
  })
}

export async function updateVehicle(userId: string,
  vehicleId: string,
  vehicle: Partial<{
    model: string,
    type: VehicleType,
    year: number,
    plate: string
  }>) {
  // Get the driver profile ID from the user ID
  const driverProfile = await db.driverProfile.findUnique({
    where: { userId: userId }
  });

  if (!driverProfile) {
    throw new Error('Driver profile not found');
  }

  // First verify the vehicle belongs to this driver
  const existingVehicle = await db.vehicle.findUnique({
    where: { id: vehicleId }
  });

  if (!existingVehicle) {
    throw new Error('Vehicle not found');
  }

  if (existingVehicle.driverId !== driverProfile.id) {
    throw new Error('Unauthorized: This vehicle does not belong to you');
  }

  // Now update the vehicle
  return db.vehicle.update({
    where: { id: vehicleId },
    data: vehicle
  });
}

export async function deleteVehicleForDriver(userId: string,
  vehicleId: string
) {
  // Get the driver profile ID from the user ID
  const driverProfile = await db.driverProfile.findUnique({
    where: { userId: userId }
  });

  if (!driverProfile) {
    throw new Error('Driver profile not found');
  }

  // First verify the vehicle belongs to this driver
  const existingVehicle = await db.vehicle.findUnique({
    where: { id: vehicleId }
  });

  if (!existingVehicle) {
    throw new Error('Vehicle not found');
  }

  if (existingVehicle.driverId !== driverProfile.id) {
    throw new Error('Unauthorized: This vehicle does not belong to you');
  }

  // Now delete the vehicle
  return db.vehicle.delete({
    where: { id: vehicleId }
  });
}

export async function getAllVehiclesForDriver(userId: string) {
  // Get the driver profile ID from the user ID
  const driverProfile = await db.driverProfile.findUnique({
    where: { userId: userId }
  });

  if (!driverProfile) {
    throw new Error('Driver profile not found');
  }

  return db.vehicle.findMany({
    where: { driverId: driverProfile.id }
  });
}