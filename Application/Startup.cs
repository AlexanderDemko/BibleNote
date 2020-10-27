using System.Reflection;
using AutoMapper;
using BibleNote.Common.DiContainer;
using BibleNote.Infrastructure.Monitoring;
using BibleNote.Infrastructure.RequestValidation;
using BibleNote.Middleware;
using ElectronNET.API;
using ElectronNET.API.Entities;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.SpaServices.AngularCli;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

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

            services.AddAutoMapper(new[] {
                typeof(BibleNote.Middleware.AutoMapperProfile).GetTypeInfo().Assembly,
                typeof(BibleNote.Infrastructure.AutoMapperProfile).GetTypeInfo().Assembly });

            services.AddApplicatonServices<MiddlewareModule>();

            services.AddMediatR(typeof(MiddlewareModule).GetTypeInfo().Assembly);
            services.AddTransient(typeof(IPipelineBehavior<,>), typeof(RequestPerformanceBehaviour<,>));
            services.AddTransient(typeof(IPipelineBehavior<,>), typeof(RequestValidationBehavior<,>));

            services.AddSwaggerDocument();
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
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

            app.UseOpenApi();
            app.UseSwaggerUi3(settings =>
            {
                settings.Path = "/api";
                settings.DocumentPath = "/api/specification.json";
            });

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
                    spa.UseAngularCliServer(npmScript: "start");
                }
            });

            ElectronBootstrap();
        }

        public async void ElectronBootstrap()
        {
            BrowserWindowOptions options = new BrowserWindowOptions
            {
                Show = false
            };
            BrowserWindow mainWindow = await Electron.WindowManager.CreateWindowAsync(options);
            mainWindow.OnReadyToShow += () =>
            {
                mainWindow.Show();
            };
            mainWindow.SetTitle("App Name here");

            MenuItem[] menu = new MenuItem[]
            {
         new MenuItem
         {
             Label = "File",
             Submenu=new MenuItem[]
             {
                 new MenuItem
                 {
                     Label ="Exit",
                     Click =()=>{Electron.App.Exit();}
                 }
             }
         },
         new MenuItem
         {
             Label = "Info",
             Click = async ()=>
             {
                 await Electron.Dialog.ShowMessageBoxAsync("Welcome to App");
             }
         }
            };

            //Electron.Menu.SetApplicationMenu(menu);
        }
    }
}
