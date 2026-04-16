import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import assistantRouter from "./assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/assistant", assistantRouter);

export default router;
