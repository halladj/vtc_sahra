import express from 'express';
import auth from './auth/auth.routes';
// import users from './user/user.routes';
import users from "./user/user.routes";

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: 'API - 👋🌎🌍🌏',
  });
});

router.use('/auth', auth);

router.use('/users', users);

export = router;