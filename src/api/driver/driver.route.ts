import express, { Request, Response, Handler } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { isAuthenticated, requireRole } from '../../middlewares/middlewares';
import { addVehicleForDriver, deleteVehicleForDriver, findDriverById, getAllVehiclesForDriver, updateVehicle } from './driver.services';
import { Role, VehicleType } from "@prisma/client";

const router = express.Router();



interface AuthenticatedRequest extends Request {
  payload?: JwtPayload;
}


router.get('/profile', isAuthenticated, async (
  req: AuthenticatedRequest, res: Response, next: any) => {
  try {
    const { userId } = req.payload!;
    const user = await findDriverById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const photoUrl = user.photo
      ? `${req.protocol}://${req.get("host")}/${user.photo.replace(/^\//, '')}`
      : null;

    // res.json(user);
    res.json({
      ...user,
      photo: photoUrl,
    });

  } catch (err) {
    next(err);
  }
});

router.post("/vehicles",
  isAuthenticated,
  requireRole(Role.DRIVER),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const {
        vehicle
      }: {
        vehicle: {
          type: VehicleType,
          model: string,
          year: number,
          plate: string
        }
      } = req.body;

      if (!vehicle) {
        res.status(400);
        throw new Error('You must provide a vehicle.');
      }

      const { userId } = req.payload!;

      const newVehicle = await addVehicleForDriver(
        userId,
        vehicle
      );
      res.json(newVehicle);

    } catch (error) {
      next(error)
    }
  }
)

router.get("/vehicles",
  isAuthenticated,
  requireRole(Role.DRIVER),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { userId } = req.payload!;
      console.log(userId);

      const vehicles = await getAllVehiclesForDriver(userId);
      res.json(vehicles);
    } catch (error) {
      next(error)
    }
  }
)

router.put("/vehicles/:vehicleId",
  isAuthenticated,
  requireRole(Role.DRIVER),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      // const {vehicleId} = req.body;
      const { vehicleId } = req.params;
      if (!vehicleId) {
        res.status(400);
        throw new Error('You must provide a vehicleId.');
      }
      const { userId } = req.payload!;
      if (userId !== req.payload!.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      console.log(req.body);
      const updatedVehicle = await updateVehicle(
        userId,
        vehicleId,
        req.body);

      res.json(updatedVehicle);
    } catch (error) {
      next(error)
    }
  }
)

router.delete("/vehicles/:vehicleId",
  isAuthenticated,
  requireRole(Role.DRIVER),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      // const {vehicleId} = req.body;
      const { vehicleId } = req.params;

      if (!vehicleId) {
        res.status(400);
        throw new Error('You must provide a vehicleId.');
      }

      const { userId } = req.payload!;
      await deleteVehicleForDriver(userId, vehicleId);
      res.json({ message: "Vehicle deleted successfully" });

    } catch (error) {
      next(error)
    }
  }
)

export = router;