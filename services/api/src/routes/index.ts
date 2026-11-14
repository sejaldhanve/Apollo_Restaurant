import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { menuRouter } from "../modules/menu/menu.routes.js";
import { fohRouter } from "../modules/foh/foh.routes.js";
import { teamRouter } from "../modules/team/team.routes.js";
import { orderRouter } from "../modules/order/order.routes.js";

export const apiRouter: Router = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/menu", menuRouter);
apiRouter.use("/foh", fohRouter);
apiRouter.use("/team", teamRouter);
apiRouter.use("/orders", orderRouter);
