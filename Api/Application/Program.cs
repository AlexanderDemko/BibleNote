using BibleNote.Infrastructure.SingleInstance;
using ElectronNET.API;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace BibleNote.Application
{
    public class Program
    {
        private static Subscriber subscriber;

        public static void Main(string[] args)
        {
            subscriber = new Subscriber(Constants.ApplicationId);
            subscriber.ReceivedData += DataReceived;
            Task.Run(() => subscriber.StartListening());

            CreateHostBuilder(args).Build().Run();      
        }

        private static void DataReceived(object sender, Data e)
        {       
            var args = e?.Arguments != null ? string.Join(";", e.Arguments) : "No args";
            Console.WriteLine(args);
            var secondInstanceLogPath = Path.Combine(Path.GetTempPath(), "BibleNote", "secondInstance.txt");
            var secondInstanceLogDirectory = Path.GetDirectoryName(secondInstanceLogPath);
            if (!string.IsNullOrEmpty(secondInstanceLogDirectory))
                Directory.CreateDirectory(secondInstanceLogDirectory);

            File.WriteAllText(secondInstanceLogPath, args);
            _ = ProcessCommandAsync(args).ContinueWith(task =>
            {
                Console.Error.WriteLine(task.Exception);
            }, TaskContinuationOptions.OnlyOnFaulted);
        }

        private static async Task ProcessCommandAsync(string args)
        {
            var window = Electron.WindowManager.BrowserWindows.FirstOrDefault();
            if (window != null)
            {
                await window.WebContents.LoadURLAsync("http://localhost:8079/data-sources");
                if (await window.IsMinimizedAsync())
                    window.Restore();
            }
        }

        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder
                        .UseElectron(args)
                        .UseStartup<Startup>();
                })
                .ConfigureLogging((hostingContext, logging) =>
                {
                    logging.ClearProviders();
                    logging.SetMinimumLevel(LogLevel.Information);
                });
    }
}
