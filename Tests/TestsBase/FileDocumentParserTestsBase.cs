using System.Linq;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.IO;
using BibleNote.Analytics.Providers.FileSystem.Navigation;

namespace BibleNote.Tests.Analytics.TestsBase
{
    public abstract class FileDocumentParserTestsBase : DocumentParserTestsBase
    {
        private string tempFolderPath;        

        public void Init(string tempFolderName, Action<IServiceCollection> registerServicesAction = null)
        {
            base.Init(registerServicesAction);

            this.tempFolderPath = Path.Combine(Environment.CurrentDirectory, tempFolderName);
            if (Directory.Exists(this.tempFolderPath))
                Directory.Delete(this.tempFolderPath, true);
            Directory.CreateDirectory(this.tempFolderPath);
        }

        public virtual void Cleanup()
        {
            try
            {
                Directory.Delete(this.tempFolderPath, true);
            }
            catch { }
        }

        protected void TestFile(string filePath, params string[][] expectedResults)
        {
            var newFilePath = Path.Combine(this.tempFolderPath, Path.GetFileName(filePath));
            File.Copy(filePath, newFilePath);

            var fileContent = File.ReadAllText(newFilePath);
            for (var i = 0; i <= 2; i++)
            {
                var parseResult = this.documentProvider.ParseDocument(new FileDocumentId(0, newFilePath, false));
                CheckParseResults(parseResult.GetAllParagraphParseResults().ToList(), expectedResults);

                if (i == 0)
                {
                    var newFileContent = File.ReadAllText(newFilePath);
                    newFileContent.Should().NotBe(fileContent);
                    fileContent = newFileContent;
                }

                if (i > 0)
                {
                    var newFileContent = File.ReadAllText(newFilePath);
                    newFileContent.Should().Be(fileContent);
                }
            }
        }
    }
}