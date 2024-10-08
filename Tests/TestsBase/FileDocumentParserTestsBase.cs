﻿using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using BibleNote.Providers.FileSystem.DocumentId;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Tests.TestsBase
{
    public abstract class FileDocumentParserTestsBase : DocumentParserTestsBase
    {
        private string tempFolderPath;        

        public void Init(string tempFolderName, Action<IServiceCollection> registerServicesAction = null)
        {
            base.Init(registerServicesAction);

            this.tempFolderPath = Path.Combine(Environment.CurrentDirectory, tempFolderName);
            if (Directory.Exists(this.tempFolderPath))
            {
                foreach (var file in Directory.GetFiles(this.tempFolderPath))
                    File.Delete(file);
            }
            else
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

        protected Task TestFileAsync(string filePath, params string[][] expectedResults)
        {
            return TestFileAsync(filePath, true, true, expectedResults);
        }

        protected async Task TestFileAsync(string filePath, bool copyFile, bool shouldChange, params string[][] expectedResults)
        {
            var newFilePath = filePath;
            if (copyFile)
            {
                newFilePath = Path.Combine(this.tempFolderPath, Path.GetFileName(filePath));
                File.Copy(filePath, newFilePath);
            }

            var fileContent = File.ReadAllText(newFilePath);
            for (var i = 0; i <= 1; i++)
            {
                var parseResult = await this.documentProvider.ParseDocumentAsync(new FileDocumentId(0, newFilePath, false));
                CheckParseResults(parseResult.GetAllParagraphParseResults().ToList(), expectedResults);

                if (i == 0)
                {
                    var newFileContent = File.ReadAllText(newFilePath);
                    if (shouldChange)
                    {
                        newFileContent.Should().NotBe(fileContent);
                        fileContent = newFileContent;
                    }                    
                    else
                    {
                        newFileContent.Should().Be(fileContent);
                        break;
                    }                    
                }
                else
                {
                    var newFileContent = File.ReadAllText(newFilePath);
                    newFileContent.Should().Be(fileContent);
                }
            }
        }
    }
}