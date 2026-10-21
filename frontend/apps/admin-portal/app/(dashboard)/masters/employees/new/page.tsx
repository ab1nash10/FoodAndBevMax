import { EmployeeCreatePageClient } from '@/components/master-data/employees/employee-create-page';
import { EmployeesPageClient } from '@/components/master-data/employees/employees-page';

// The form opens as the side panel over its list (FormShell), as editing a record does.
export default function CreateEmployeePage() {
  return (
    <>
      <EmployeesPageClient />
      <EmployeeCreatePageClient />
    </>
  );
}
