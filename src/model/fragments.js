import { createModel } from 'mongoose-gridfs';
import mongoose from 'mongoose';

const mongooseGridFS = createModel({
    modelName: 'Fragment',
    bucketName: 'Fragments',
    connection: mongoose.connection,
});

export default mongooseGridFS;