import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import healthRoutes from '../modules/health/health.routes';
import rolesRoutes from '../modules/roles/roles.routes';
import employeesRoutes from '../modules/employees/employees.routes';
import timeoffRoutes from '../modules/timeoff/timeoff.routes';
import chatRoutes from '../modules/chat/chat.routes';
import payrollRoutes from '../modules/payroll/payroll.routes';
import organizationRoutes from '../modules/organization/organization.routes';
import holidaysRoutes from '../modules/holidays/holidays.routes';
import policiesRoutes from '../modules/policies/policy.routes';
import settingsRoutes from '../modules/settings/settings.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import reportsRoutes from '../modules/reports/reports.routes';
import notificationsRoutes from '../modules/notifications/notifications.routes';
import deskManagementRoutes from '../modules/desk-management/desk.routes';
import calendarsRoutes from '../modules/calendars/calendar.routes';
import eventsRoutes from '../modules/events/event.routes';
import itSupportRoutes from '../modules/tickets/it-support.routes';
import hrHelpdeskRoutes from '../modules/tickets/hr-helpdesk.routes';
import expensesRoutes from '../modules/expenses/expense.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/roles', rolesRoutes);
router.use('/employees', employeesRoutes);
router.use('/timeoff', timeoffRoutes);
router.use('/chat', chatRoutes);
router.use('/payroll', payrollRoutes);
router.use('/organization', organizationRoutes);
router.use('/holidays', holidaysRoutes);
router.use('/policies', policiesRoutes);
router.use('/settings', settingsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);
router.use('/notifications', notificationsRoutes);

// ---- Workplace modules ----
router.use('/desk-management', deskManagementRoutes);
router.use('/calendars', calendarsRoutes);
router.use('/events', eventsRoutes);
router.use('/it-support', itSupportRoutes);
router.use('/hr-helpdesk', hrHelpdeskRoutes);
router.use('/expenses', expensesRoutes);

export default router;
