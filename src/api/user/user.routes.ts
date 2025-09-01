import express, {Request, Response, Handler} from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { isAuthenticated } from '../../middlewares';
import { findUserById } from './user.services';

const router = express.Router();



interface AuthenticatedRequest extends Request {
  payload?: JwtPayload;
}


router.get('/profile', isAuthenticated, async (
  req:AuthenticatedRequest, res:Response, next:any) => {
  try {
    const { userId } = req.payload!;
    const user = await findUserById(userId);
    // delete user.password;
    res.json(user);
  } catch (err) {
    next(err);
  }
});


export = router;