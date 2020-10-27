using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using BibleNote.Common.DiContainer;
using BibleNote.Domain.Enums;
using BibleNote.Providers.FileSystem.DocumentId;
using BibleNote.Providers.Html;
using BibleNote.Providers.Word;
using BibleNote.Services;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.ModulesManager.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.VerseDifferencesFinder
{
    public partial class MainWindow : Window
    {
        const string ModulesFolderName = "Modules";
        const string ResultsFileName = "results.txt";
        const string TempFileName = "temp.txt";

        public ServiceProvider ServiceProvider { get; private set; }

        public MainWindow()
        {
            InitializeComponent();
            cbModules.ItemsSource = GetModules()?.Keys;
            cbModules.SelectedItem = "rst";
        }

        private async void Button_Click(object sender, RoutedEventArgs e)
        {
            if (cbModules.SelectedItem == null)
            {
                MessageBox.Show("Please select a target module");
                return;
            }

            if (string.IsNullOrEmpty(tbSourceFile.Text))
            {
                MessageBox.Show("Please select a source file");
                return;
            }

            var moduleShortName = cbModules.SelectedItem.ToString();
            InitApp(moduleShortName);

            var sourceFilePath = GetTextFilePath(tbSourceFile.Text); 
            var result = await FindVersesDifferencesAsync(sourceFilePath);
            SaveResults(result);
        }

        private string GetTextFilePath(string userFilePath)
        {
            var fileExtension = Path.GetExtension(userFilePath);
            if (fileExtension == ".txt" || fileExtension == ".html" || fileExtension == ".docx")
                return userFilePath;

            var tempFilePath = Path.Combine(Directory.GetCurrentDirectory(), TempFileName);
            var fileText = GetPdfText(userFilePath);
            File.WriteAllText(tempFilePath, fileText);
            return tempFilePath;
        }

        private string GetPdfText(string userFilePath)
        {
            using var reader = new iTextSharp.text.pdf.PdfReader(userFilePath);
            var text = string.Empty;
            for (int page = 1; page <= reader.NumberOfPages; page++)
            {
                text += iTextSharp.text.pdf.parser.PdfTextExtractor.GetTextFromPage(reader, page);
            }
            reader.Close();
            return text;
        }

        private void SaveResults(List<string> result)
        {
            if (!result.Any())
                result.Add("There are no such verses");

            var filePath = Path.Combine(Directory.GetCurrentDirectory(), ResultsFileName);
            File.WriteAllText(filePath, string.Join(Environment.NewLine, result));
            System.Diagnostics.Process.Start("notepad.exe", filePath);
        }

        private async Task<List<string>> FindVersesDifferencesAsync(string sourceFilePath)
        {
            var documentProvider = GetDocumentProvider(sourceFilePath);

            var parseResult = await documentProvider.ParseDocumentAsync(new FileDocumentId(0, sourceFilePath, true));
            var parseResults = parseResult.GetAllParagraphParseResults().ToList();
            var versesFromOtherModules = parseResults
                .SelectMany(pr => pr.VerseEntries
                                    .Where(ve => ve.VersePointer.ModuleShortName != null)
                                    .Select(ve => ve.VersePointer));

            var versesWithDifferentChapterOrVerse = versesFromOtherModules
                .Where(v => v.VerseNumber != v.OriginalVerseNumber
                         || v.TopVerseNumber != v.OriginalTopVerseNumber);

            return versesWithDifferentChapterOrVerse
                .Select(v => $"{v.OriginalVerseName} => {v}")
                .ToList();
        }

        private IDocumentProvider GetDocumentProvider(string sourceFilePath)
        {
            var fileType = FileTypeHelper.GetFileType(sourceFilePath);
            switch (fileType)
            {
                case FileType.Html:
                case FileType.Text:
                    return ServiceProvider.GetService<HtmlProvider>();
                case FileType.Word:
                    return ServiceProvider.GetService<WordProvider>();
                default:
                    throw new NotSupportedException(fileType.ToString());
            }
        }

        private void InitApp(string moduleShortName)
        {
            var services = new ServiceCollection()
                .AddApplicatonServices<ServicesModule>()
                .AddApplicatonServices<HtmlModule>()
                .AddApplicatonServices<WordModule>()
                .AddScoped<IConfigurationManager>(sp => new ConfigurationManager(moduleShortName))
                .AddScoped<HtmlProvider>()
                .AddScoped<WordProvider>()
                .AddLogging();

            ServiceProvider = services
               .BuildServiceProvider();

            var modulesManager = ServiceProvider.GetService<IModulesManager>();

            UploadModules(moduleShortName, modulesManager);
        }

        private void UploadModules(string moduleShortName, IModulesManager modulesManager)
        {
            var modules = GetModules();
            var targetModule = modules[moduleShortName];
            modulesManager.UploadModule(targetModule, moduleShortName);

            foreach (var module in modules.Where(m => m.Key != moduleShortName))
            {
                modulesManager.UploadModule(module.Value, module.Key);
            }
        }

        private static string GetSourceFileName()
        {
            var dlg = new Microsoft.Win32.OpenFileDialog
            {
                Filter = "Word files (*.docx)|*.docx|Html files (*.html)|*.html|Text files (*.txt)|*.txt|PDF Files (*.pdf)|*.pdf"
            };

            if (dlg.ShowDialog() == true)
                return dlg.FileName;
            else
                return null;
        }

        private Dictionary<string, string> GetModules()
        {
            if (!Directory.Exists(ModulesFolderName))
            {
                MessageBox.Show($"{ModulesFolderName} folder was not found");
                Application.Current.Shutdown();
                return null;
            }

            var modules = Directory.GetFiles(ModulesFolderName, "*.bnm", SearchOption.TopDirectoryOnly);
            return modules.ToDictionary(f => Path.GetFileNameWithoutExtension(f));
        }

        private void btnSelectSourceFile_Click(object sender, RoutedEventArgs e)
        {
            tbSourceFile.Text = GetSourceFileName();
        }     
    }
}
