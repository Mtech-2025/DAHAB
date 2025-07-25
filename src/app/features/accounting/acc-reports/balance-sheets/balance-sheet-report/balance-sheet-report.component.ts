import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SharedModule } from '../../../../../shared/shared.module';
import { ReportsService } from '../../../@services/reports.service';
import { BalanceSheetReportResponse, BalanceSheetNodeMap, BalanceSheetNode } from '../balance-sheet-reports.models';
import { ToasterMsgService } from '../../../../../core/services/toaster-msg.service';
import { ReportExportService, ReportConfig, ReportColumn } from '../../../@services/report-export.service';
import { DropdownsService } from '../../../../../core/services/dropdowns.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { DataTableColumn } from '../../../../../shared/models/common.models';

interface BalanceSheetTableItem {
  description: string;
  amount: number | null;
  level: number;
  isParent: boolean;
  code: string;
  id: number;
}

@Component({
  selector: 'app-balance-sheet-report',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    SharedModule
  ],
  templateUrl: './balance-sheet-report.component.html',
  styleUrl: './balance-sheet-report.component.scss'
})
export class BalanceSheetReportComponent implements OnInit {
  filterForm!: FormGroup;
  branches: any[] = [];
  balanceSheetData: BalanceSheetReportResponse | null = null;
  balanceSheetTree: BalanceSheetNodeMap | null = null;
  balanceSheetTableData: BalanceSheetTableItem[] = [];
  currency: string = '';

  columns: DataTableColumn<BalanceSheetTableItem>[] = [
    {
      field: "description",
      header: "Description",
      body: (row: BalanceSheetTableItem) => this.getDescriptionWithIndentation(row)
    },
    {
      field: "amount",
      header: "Amount",
      body: (row: BalanceSheetTableItem) => this.getFormattedAmount(row)
    }
  ];

  exportItems = [
    {
      label: 'Export to PDF',
      icon: 'pi pi-file-pdf',
      command: () => this.exportToPDF()
    },
    {
      label: 'Export to Excel',
      icon: 'pi pi-file-excel',
      command: () => this.exportToExcel()
    },
    {
      label: 'Export to CSV',
      icon: 'pi pi-file',
      command: () => this.exportToCSV()
    }
  ];

  private toaster = inject(ToasterMsgService);
  private reportExportService = inject(ReportExportService);

  shopName!: string;
  shopLogoURL!: string;

  constructor(
    private _formBuilder: FormBuilder,
    private _reportsService: ReportsService,
    private _dropdownService: DropdownsService,
    private _authService: AuthService
  ) { }

  ngOnInit(): void {
    this.prepareFilterForm();

    this._dropdownService.getBranches().subscribe(res => {
      this.branches = res.results;
    })

    // Load initial data with default current month filter
    const initialFilter = this.getFilterObject();
    this.getData(initialFilter);
  }

  prepareFilterForm() {
    // Get current month's first and last day
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    this.filterForm = this._formBuilder.group({
      created_from: [this.formatDate(firstDayOfMonth), Validators.required],
      created_to: [this.formatDate(lastDayOfMonth), Validators.required],
      search: null,
      branch: null
    }, { validators: this.dateRangeValidator });
  }

  // Custom validator for date range
  dateRangeValidator(formGroup: FormGroup) {
    const fromDate = formGroup.get('created_from')?.value;
    const toDate = formGroup.get('created_to')?.value;

    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      return { dateRangeInvalid: true };
    }
    return null;
  }

  formatDate(date: Date) {
    return date.toISOString().split('T')[0];
  }

  private getData(filter: {} = {}) {
    this._reportsService.getBalanceSheetReport(filter).subscribe({
      next: (response: BalanceSheetReportResponse) => {
        this.balanceSheetData = response;
        this.currency = response.currency;
        this.shopName = response.name ?? this._authService.getUser()?.business_name ?? '-';
        this.shopLogoURL = response.logo ?? this._authService.getUser()?.image ?? '';
        this.balanceSheetTree = response.balance_sheet;
        this.processBalanceSheetToTable();
      },
      error: (error) => {
        this.toaster.showError('Failed to load balance sheet data. Please try again.');
      }
    });
  }

  private processBalanceSheetToTable() {
    this.balanceSheetTableData = [];
    if (this.balanceSheetTree) {
      this.flattenBalanceSheetTree(this.balanceSheetTree, 0);
    }
  }

  private flattenBalanceSheetTree(nodeMap: BalanceSheetNodeMap, level: number) {
    Object.keys(nodeMap).forEach(key => {
      const node = nodeMap[key];

      // Add the current node to the table
      this.balanceSheetTableData.push({
        description: node.name,
        amount: node.total_amount,
        level: level,
        isParent: !!node.subaccounts && Object.keys(node.subaccounts).length > 0,
        code: node.code,
        id: node.id
      });

      // Recursively process children if they exist
      if (node.subaccounts && Object.keys(node.subaccounts).length > 0) {
        this.flattenBalanceSheetTree(node.subaccounts, level + 1);
      }
    });
  }

  getDescriptionWithIndentation(row: BalanceSheetTableItem): string {
    // Create indentation using nested blockquote elements
    let openTags = '';
    let closeTags = '';

    let indentation = "   ".repeat(row.level)

    for (let i = 0; i < row.level; i++) {
      openTags += '<blockquote>';
      closeTags = '</blockquote>' + closeTags;
    }

    // Apply semantic markup based on whether it's a parent or child item
    const displayText = `${indentation}${row.description}`;
    if (row.isParent) {
      return `${openTags}<strong><pre>${displayText}</pre></strong>${closeTags}`;
    } else {
      return `${openTags}<pre>${displayText}</pre>${closeTags}`;
    }
  }

  getDescriptionWithIndentationForReport(row: BalanceSheetTableItem): string {

    let indentation = "     ".repeat(row.level)

    // Apply semantic markup based on whether it's a parent or child item
    return `${indentation}${row.description}`;
  }


  getFormattedAmount(row: BalanceSheetTableItem): string {
    if (row.amount === null) {
      return '-';
    }
    return row.amount.toFixed(3) + ' ' + this.currency;
  }

  onSearch() {
    // Mark all fields as touched to show validation errors
    this.filterForm.markAllAsTouched();

    if (this.filterForm.invalid) {
      // Show alert if required date fields are missing
      if (this.filterForm.get('created_from')?.invalid || this.filterForm.get('created_to')?.invalid) {
        this.toaster.showError("Please select both From Date and To Date to filter the report.")
      }
      // Show alert if date range is invalid
      else if (this.filterForm.errors?.['dateRangeInvalid']) {
        this.toaster.showError("From Date cannot be later than To Date.")
      }
      return;
    }

    // Get the filter object and ensure it's valid
    const filterObject = this.getFilterObject();

    // Only proceed if we have valid filter data
    if (filterObject && Object.keys(filterObject).length > 0) {
      this.getData(filterObject);
    }
  }

  private getFilterObject() {
    const filterValues = { ...this.filterForm.value }; // Create a copy to avoid mutating original

    // replace created_from and created_to with created_at__range (Multiple values may be separated by commas.)
    let filter: any = {};

    if (filterValues.created_from && filterValues.created_to) {
      // Format dates as YYYY-MM-DD for backend
      const formatDateForBackend = (dateValue: string): string => {
        const date = new Date(dateValue);
        return date.toISOString().split('T')[0];
      };

      filter.created_at__range = `${formatDateForBackend(filterValues.created_from)},${formatDateForBackend(filterValues.created_to)}`;
    }

    // Remove created_from and created_to from filterValues copy
    delete filterValues.created_from;
    delete filterValues.created_to;

    // remove empty values from filterValues
    Object.keys(filterValues).forEach(key => {
      if (filterValues[key] === null || filterValues[key] === '' || filterValues[key] === undefined) {
        delete filterValues[key];
      }
    });

    const finalFilter = {
      ...filter,
      ...filterValues
    };

    return finalFilter;
  }

  // Create report configuration for the export service
  private getReportConfig(): ReportConfig {
    const reportColumns: ReportColumn[] = [
      {
        field: 'description',
        header: 'Description',
        body: (row: BalanceSheetTableItem) => this.getDescriptionWithIndentationForReport(row)
      },
      {
        field: 'amount',
        header: `Amount (${this.currency})`,
        body: (row: BalanceSheetTableItem) => this.getFormattedAmount(row)
      }
    ];

    return {
      title: 'Balance Sheet Report',
      data: this.balanceSheetTableData,
      columns: reportColumns,
      filterForm: this.filterForm,
      businessName: this.shopName,
      businessLogoURL: this.shopLogoURL,
      filename: 'balance-sheet-report'
    };
  }

  exportToPDF(): void {
    if (!this.balanceSheetData || this.balanceSheetTableData.length === 0) {
      this.toaster.showInfo('No data to export.');
      return;
    }
    this.reportExportService.exportToPDF(this.getReportConfig());
  }

  exportToExcel(): void {
    if (!this.balanceSheetData || this.balanceSheetTableData.length === 0) {
      this.toaster.showInfo('No data to export.');
      return;
    }
    this.reportExportService.exportToExcel(this.getReportConfig());
  }

  exportToCSV(): void {
    if (!this.balanceSheetData || this.balanceSheetTableData.length === 0) {
      this.toaster.showInfo('No data to export.');
      return;
    }
    this.reportExportService.exportToCSV(this.getReportConfig());
  }

  printReport(): void {
    if (!this.balanceSheetData || this.balanceSheetTableData.length === 0) {
      this.toaster.showInfo('No data to print.');
      return;
    }
    this.reportExportService.printReport(this.getReportConfig());
  }
}
