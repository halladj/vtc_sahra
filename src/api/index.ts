import express from 'express';
import auth from './auth/auth.routes';
import users from './user/user.routes';
import drivers from "./driver/driver.route";

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: 'API - 👋🌎🌍🌏',
  });
});

router.use('/auth', auth);

router.use('/users', users);

router.use('/drivers', drivers)

export = router;