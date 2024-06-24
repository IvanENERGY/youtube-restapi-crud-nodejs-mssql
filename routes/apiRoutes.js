const router=require('express').Router();
const tasksController=require('../controllers/tasksController');

//READ
router.get("/tasks",tasksController.index,tasksController.respondJSON);
router.get("/tasks/:id",tasksController.indexOne,tasksController.respondJSON);

//CREATE
router.post("/tasks",tasksController.create,tasksController.respondJSON);

//UPDATE
router.put("/tasks/:id/update",tasksController.update,tasksController.respondJSON);

//DELETE
router.delete("/tasks/:id/delete",tasksController.delete,tasksController.respondJSON);

//ERROR handling
router.use(tasksController.errorJSON);

module.exports=router;