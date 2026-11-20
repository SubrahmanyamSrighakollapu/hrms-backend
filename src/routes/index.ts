import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import healthRoutes from '../modules/health/health.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// ---- Register new module routers here as modules are built ----
// router.use('/timeoff', timeoffRoutes);   // leaves, permissions, regularization, extra hours
// router.use('/payroll', payrollRoutes);   // HR uploads payslips, employees download
// router.use('/chat', chatRoutes);         // employee <-> manager/team internal chat
// router.use('/users', userRoutes);        // admin/hr user management

export default router;
