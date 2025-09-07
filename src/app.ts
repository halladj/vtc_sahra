import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import { setupSwagger } from "./swagger";

require('dotenv').config();

// import middlewares from './middlewares';
import api from './api';
import { errorHandler, notFound } from './middlewares/middlewares';
import path from 'path';

const app = express();


app.use(morgan('dev'));
app.use(helmet());
app.use(cors());
app.use(express.json());

setupSwagger(app);

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));


app.get('/', (req, res) => {
  res.json({
    message: '🦄🌈✨👋🌎🌍🌏✨🌈🦄',
  });
});

app.use('/api/v1', api);

app.use(notFound);
app.use(errorHandler);

export = app;