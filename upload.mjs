import { extname } from 'path';

import multer, { diskStorage } from 'multer';

const storageGPX = diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, 'planned.gpx');
    }
});

const storagePhoto = diskStorage({
    destination: 'uploads/images',
    filename: (req, file, cb) => {
        console.log("file: ");
        console.log(file);
        cb(null, Date.now() + extname(file.originalname));
    }
})

export const uploadGPX = multer({ storage: storageGPX });
export const uploadPhoto = multer({ storage: storagePhoto });

// export default { uploadGPX, uploadPhoto };