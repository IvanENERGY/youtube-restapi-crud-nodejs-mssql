const router=require("express").Router();
const apiRouter=require("./apiRoutes");
router.use("/api",apiRouter);
router.use("/",(req,res)=>{res.json({"startingpage":"Server is running!"})});

module.exports=router;