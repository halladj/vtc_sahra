import express, {Request, Response, Handler} from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { createUploader, isAuthenticated } from '../../middlewares/middlewares';
import { findUserById, updateUser, updateUserPhoto } from './user.services';

const router = express.Router();

const userPhotoUpload = createUploader("users");

interface AuthenticatedRequest extends Request {
  payload?: JwtPayload;
}


router.get('/profile', isAuthenticated, async (
  req:AuthenticatedRequest, res:Response, next:any) => {
  try {
    const { userId } = req.payload!;
    const user = await findUserById(userId);
    // delete user.password;
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const photoUrl = user.photo
      ? `${req.protocol}://${req.get("host")}${user.photo}`
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


router.put("/photo", 
  isAuthenticated, 
  userPhotoUpload.single('photo'), 

  async (req:AuthenticatedRequest, res:Response, next:any) => {
  try {
    const { userId } = req.payload!;

    const photoUrl = req.file ? `${req.protocol}://${req.get("host")}/uploads/users/${req.file.filename}` : null;
    const user = await updateUserPhoto(
      userId, 
      photoUrl ? photoUrl: ""
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
})

router.put("/profile", isAuthenticated, 

  async (req:AuthenticatedRequest, res:Response, next:any) => {
    try {
      const { userId } = req.payload!;
      const updatedUser = await updateUser(userId,req.body);

      const photoUrl = updatedUser.photo
        ? `${req.protocol}://${req.get("host")}${updatedUser.photo}`
        : null;

    // res.json(user);
     res.json({
      ...updateUserPhoto,
      photo: photoUrl, 
    });

      
      res.json(updatedUser);
    } catch (err) {
      next(err);
    }
  }
)

export = router;