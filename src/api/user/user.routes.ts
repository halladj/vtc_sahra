import express, {Request, Response, Handler} from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { isAuthenticated, upload } from '../../middlewares';
import { findUserById, updateUserPhoto } from './user.services';

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


router.put(
  "/photo", 
  isAuthenticated, 
  upload.single('photo'), 

  async (req:AuthenticatedRequest, res:Response, next:any) => {
  try {
    const { userId } = req.payload!;

    const photoUrl = req.file ? `/uploads/users/${req.file.filename}` : null;
    const user = await updateUserPhoto(
      userId, 
      photoUrl ? photoUrl: ""
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
})
export = router;