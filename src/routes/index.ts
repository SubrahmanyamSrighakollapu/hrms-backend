import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import healthRoutes from '../modules/health/health.routes';
import rolesRoutes from '../modules/roles/roles.routes';
import employeesRoutes from '../modules/employees/employees.routes';
import timeoffRoutes from '../modules/timeoff/timeoff.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/roles', rolesRoutes);
router.use('/employees', employeesRoutes);
router.use('/timeoff', timeoffRoutes);

// ---- Register new module routers here as modules are built ----
// router.use('/payroll', payrollRoutes);   // HR uploads payslips, employees download
// router.use('/chat', chatRoutes);         // employee <-> manager/team internal chat
// router.use('/users', userRoutes);        // employee management (directory, categories)

export default router;
