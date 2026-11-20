import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import healthRoutes from '../modules/health/health.routes';
import rolesRoutes from '../modules/roles/roles.routes';
import employeesRoutes from '../modules/employees/employees.routes';
import timeoffRoutes from '../modules/timeoff/timeoff.routes';
import chatRoutes from '../modules/chat/chat.routes';
import payrollRoutes from '../modules/payroll/payroll.routes';
import organizationRoutes from '../modules/organization/organization.routes';
import settingsRoutes from '../modules/settings/settings.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import reportsRoutes from '../modules/reports/reports.routes';
import notificationsRoutes from '../modules/notifications/notifications.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/roles', rolesRoutes);
router.use('/employees', employeesRoutes);
router.use('/timeoff', timeoffRoutes);
router.use('/chat', chatRoutes);
router.use('/payroll', payrollRoutes);
router.use('/organization', organizationRoutes);
router.use('/settings', settingsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);
router.use('/notifications', notificationsRoutes);

// ---- Register new module routers here as modules are built ----
// router.use('/users', userRoutes);        // employee management (directory, categories)

export default router;
