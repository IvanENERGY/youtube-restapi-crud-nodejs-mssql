const express= require('express');
const router=require('./routes/index');

const cors=require('cors');

const app=express();
app.set("port",process.env.PORT||3000);


app.use(express.urlencoded({extended:false}));
app.use(express.json());
app.use(cors());

app.use("/",router);
app.listen(app.get("port"),()=>{console.log(`The app is listening on PORT ${app.get("port")}`)});