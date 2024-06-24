const httpStatus = require('http-status-codes');
const Task = require('../models/task');
var config= require('../db_config');
const sql= require('mssql');

module.exports={
    //READ
    index:(req,res,next)=>{
        sql.connect(config).then(()=>{
            let sqlRequest= new sql.Request();
            return sqlRequest.query('select * from Task')
        })
        .then((result)=>{
            res.locals.data=result.recordsets;
            res.locals.opMsg="Retrieval Success";
            next();
        })
        .catch((err)=>{
            res.locals.opMsg="err fetching all tasks!";
            next(err);
        })
    },
    //READONE
    indexOne:(req,res,next)=>{
        let id=req.params.id;
        sql.connect(config).then(()=>{
            let sqlRequest=new sql.Request();
            return sqlRequest.input('id',sql.Int,id)
                            .query(`select * from Task where id = @id `)
        })
        .then((result)=>{
            res.locals.data=result;
            res.locals.opMsg="Retrieve One record success";
            next();
        })
        .catch(err=>{
            res.locals.opMsg="err fetching One!";
            next(err);
        })
    },
    //CREATE
    create:(req,res,next)=>{
        const task= new Task(
            req.body.taskName,
            req.body.deadline,
            req.body.reps,
            req.body.filePath
        )
        sql.connect(config).then(()=>{
            let sqlRequest= new sql.Request();
            return sqlRequest.input('taskName',sql.NVarChar,task.taskName)
                            .input('deadline',sql.Date,task.deadline)
                            .input('reps',sql.Int,task.reps)
                            .input('filePath',sql.NVarChar,task.filePath)
                            .query(`Insert into task (taskName,deadline,reps,filePath)
                                    Values(@taskName, @deadline, @reps , @filePath)`)
        })
        .then((result)=>{
            res.locals.data=result;
            res.locals.opMsg="Create Successful";
            next();
        })
        .catch((err)=>{
            res.locals.opMsg="err adding new record"+err;
            next(err);
        })
    } ,
    update:(req,res,next)=>{
        const task= new Task(
            req.body.taskName,
            req.body.deadline,
            req.body.reps,
            req.body.filePath
        )
        sql.connect(config).then(()=>{
            let sqlRequest= new sql.Request();
            return sqlRequest.input('id',sql.Int,req.params.id)
                            .input('taskName',sql.NVarChar,task.taskName)
                            .input('deadline',sql.Date,task.deadline)
                            .input('reps',sql.Int,task.reps)
                            .input('filePath',sql.NVarChar,task.filePath)
                            .query(`UPDATE Task 
                                SET taskName=@taskName,
                                    deadline=@deadline,
                                    reps=@reps,
                                    filePath=@filePath
                                WHERE id = @id `)

        })
        .then((result)=>{
            res.locals.data=result;
            res.locals.opMsg="Update Success";
            next();
        })
        .catch((err)=>{
            res.locals.opMsg="CANNOT UPDATE Tasks" +err;
            next(err);
        })
    },
    //DELETE
    delete:(req,res,next)=>{
        sql.connect(config).then(()=>{
            let sqlRequest= new sql.Request();
            return sqlRequest.input('id',sql.Int,req.params.id)
                            .query(`DELETE FROM Task WHERE id = @id `)
        })
        .then((result)=>{
            res.locals.data=result;
            res.locals.opMsg="Delete Success";
            next();
        })
        .catch((err)=>{
            res.locals.opMsg="CANNOT delete"+err;
            next(err);
        })
    },

    respondJSON:(req,res)=>{
        res.json(
            {
                status:httpStatus.StatusCodes.OK,
                data:res.locals.data,
                opMsg:res.locals.opMsg
            }
        )
    }
    ,
    errorJSON:(error,req,res,next)=>{
        let errorObj;
        if (error){
            errorObj={
                status:httpStatus.StatusCodes.INTERNAL_SERVER_ERROR,
                message:error.message
            }
        }
        else{
            errorObj={
                status:httpStatus.StatusCodes.INTERNAL_SERVER_ERROR,
                message:"Unknown Error"
            }
        }
        res.json(errorObj);
    }
}