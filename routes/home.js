import { Router } from "express";

let router = new Router();

router.get('/', async (req, res, next) => {

    try {
        res.render("index.ejs", {
            // userdata: JSON.stringify(userdata, null, 2)?.replace(/'/g, "&apos;"),
            // port: process.env.PORT,
        });
    } catch (err) {
        next(err);
    }
});

router.get('/receive', async (req, res, next) => {
    try {
        res.render("receive.ejs");
    } catch (err) {
        next(err);
    }
});

router.get('/receive/:id', async (req, res, next) => {
    // let id = req.params.id;
    try {
        res.render("receive.ejs", {
            // ...(id && { id }),
        });
    } catch (err) {
        next(err);
    }
});

export default router;