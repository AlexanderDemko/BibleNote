using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using AutoMapper;
using BibleNote.Common.DiContainer;
using BibleNote.Domain.Contracts;
using BibleNote.Infrastructure.Monitoring;
using BibleNote.Infrastructure.RequestValidation;
using BibleNote.Middleware;
using BibleNote.Persistence;
using BibleNote.Providers.FileSystem.Navigation;
using BibleNote.Providers.Html;
using BibleNote.Providers.OneNote;
using BibleNote.Services;
using ElectronNET.API;
using ElectronNET.API.Entities;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BibleNote.Application
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddControllersWithViews();
            // In production, the Angular files will be served from this directory
            services.AddSpaStaticFiles(configuration =>
            {
                configuration.RootPath = "ClientApp/dist";
            });

            services.AddAutoMapper(_ => { },
                typeof(BibleNote.Middleware.AutoMapperProfile).GetTypeInfo().Assembly,
                typeof(BibleNote.Infrastructure.AutoMapperProfile).GetTypeInfo().Assembly);

            services.AddApplicatonServices<MiddlewareModule>();

            services.AddMediatR(typeof(MiddlewareModule).Assembly);
            services.AddTransient(typeof(IPipelineBehavior<,>), typeof(RequestPerformanceBehaviour<,>));
            services.AddTransient(typeof(IPipelineBehavior<,>), typeof(RequestValidationBehavior<,>));

            services
               .AddApplicatonServices<PersistenceModule>()
               .AddApplicatonServices<ServicesModule>()
               .AddApplicatonServices<HtmlModule>()
               .AddApplicatonServices<OneNoteModule>()
               .AddApplicatonServices<FileNavigationModule>();

            services.AddLogging();

            services.AddSwaggerDocument();
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env, IMapper mapper, ITrackingDbContext dbContext, ILogger<Startup> logger)
        {
            mapper.ConfigurationProvider.AssertConfigurationIsValid();

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Error");
            }

            app.UseStaticFiles();
            if (!env.IsDevelopment())
            {
                app.UseSpaStaticFiles();
            }

            UseSwaggerSpecification(app);

            app.UseRouting();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllerRoute(
                    name: "default",
                    pattern: "{controller}/{action=Index}/{id?}");
            });

            app.UseSpa(spa =>
            {
                // To learn more about options for serving an Angular SPA from ASP.NET Core,
                // see https://go.microsoft.com/fwlink/?linkid=864501

                spa.Options.SourcePath = "ClientApp";

                if (env.IsDevelopment())
                {
                    //spa.UseAngularCliServer(npmScript: "start");
                    spa.UseProxyToSpaDevelopmentServer("http://localhost:4200");
                }
            });

            if (HybridSupport.IsElectronActive)
            {
                _ = ElectronBootstrap(logger);
            }

            dbContext.InitDatabaseAsync().GetAwaiter().GetResult();
        }

        private static void UseSwaggerSpecification(IApplicationBuilder app)
        {
            const string specificationPath = "/api/specification.json";
            const string apiRoute = "/api";

            app.UseOpenApi(settings =>
            {
                settings.Path = specificationPath;
            });

            app.UseSwaggerUi(settings =>
            {
                settings.Path = apiRoute;
                settings.DocumentPath = specificationPath;
            });
        }

        private static async Task ElectronBootstrap(ILogger logger)
        {
            try
            {
                if (await Electron.App.CommandLine.HasSwitchAsync("dog"))
                {
                    string value = await Electron.App.CommandLine.GetSwitchValueAsync("dog");
                    logger.LogInformation("Electron command switch dog={Value}", value);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to read Electron command line switches.");
            }

            var options = new BrowserWindowOptions
            {
                Show = false,
                Title = "BibleNote"
            };
            var mainWindow = await Electron.WindowManager.CreateWindowAsync(options, "http://localhost:8079/data-sources");
            mainWindow.OnReadyToShow += () =>
            {
                mainWindow.Show();
            };            

            //MenuItem[] menu = new MenuItem[]
            //{
            //    new MenuItem
            //    {
            //        Label = "File",
            //        Submenu=new MenuItem[]
            //        {
            //            new MenuItem
            //            {
            //                Label ="Exit",
            //                Click =()=>{Electron.App.Exit();}
            //            }
            //        }
            //    },
            //    new MenuItem
            //    {
            //        Label = "Info",
            //        Click = async ()=>
            //        {
            //            await Electron.Dialog.ShowMessageBoxAsync("Welcome to App");
            //        }
            //    }
            //};

            //Electron.Menu.SetApplicationMenu(menu);
        }
    }
}
