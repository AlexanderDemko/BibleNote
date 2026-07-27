using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Principal;
using System.Text;

namespace BibleNote.OneNoteRibbon.Registrar
{
    internal static class Program
    {
        private const string SettingsKey = @"Software\BibleNote\OneNoteRibbon";
        private static readonly string[] BibleProtocols = { "bnVerse:", "isbtBibleVerse:" };

        private static readonly AddInVariant[] Variants =
        {
            new AddInVariant(14, "2010", "BibleNote.OneNoteRibbon.Office2010", "E4B377A1-53D3-48B4-9B29-41AA0D95E410"),
            new AddInVariant(15, "2013", "BibleNote.OneNoteRibbon.Office2013", "E4B377A1-53D3-48B4-9B29-41AA0D95E413"),
            new AddInVariant(16, "2016", "BibleNote.OneNoteRibbon.Office2016", "E4B377A1-53D3-48B4-9B29-41AA0D95E416")
        };

        private static int Main(string[] args)
        {
            try
            {
                var action = args.FirstOrDefault() ?? "status";
                var root = Option(args, "--root") ?? AppDomain.CurrentDomain.BaseDirectory;
                var executablePath = Option(args, "--exe");
                var controlUrl = Option(args, "--control-url");
                var targetUserSid = Option(args, "--user-sid")
                    ?? WindowsIdentity.GetCurrent().User.Value;
                var installs = DetectOneNoteInstalls();

                switch (action.ToLowerInvariant())
                {
                    case "install":
                        if (!IsAdministrator() && !args.Any(item => string.Equals(item, "--elevated", StringComparison.OrdinalIgnoreCase)))
                        {
                            RunElevated(WithTargetUserSid(args, targetUserSid));
                            break;
                        }
                        if (installs.Count == 0)
                            throw new InvalidOperationException("Классическая настольная версия OneNote не найдена.");
                        RemoveKnownRegistrations();
                        foreach (var group in installs.GroupBy(item => new { item.View, item.MajorVersion }))
                        {
                            var install = group.First();
                            RegisterAddIn(install, VariantFor(install.MajorVersion), root);
                        }
                        WriteSettings(executablePath, controlUrl);
                        TrustBibleProtocolForOffice(targetUserSid);
                        break;
                    case "uninstall":
                        if (!IsAdministrator() && !args.Any(item => string.Equals(item, "--elevated", StringComparison.OrdinalIgnoreCase)))
                        {
                            RunElevated(WithTargetUserSid(args, targetUserSid));
                            break;
                        }
                        RemoveKnownRegistrations();
                        break;
                    case "configure":
                        WriteSettings(executablePath, controlUrl);
                        break;
                    case "status":
                        break;
                    default:
                        throw new ArgumentException("Неизвестная команда регистратора: " + action);
                }

                Console.OutputEncoding = Encoding.UTF8;
                Console.WriteLine(StatusJson(installs, root));
                return 0;
            }
            catch (Exception exception)
            {
                Console.OutputEncoding = Encoding.UTF8;
                Console.WriteLine("{\"available\":true,\"enabled\":false,\"error\":" + Json(exception.Message) + "}");
                return 1;
            }
        }

        private static List<OneNoteInstall> DetectOneNoteInstalls()
        {
            var result = new List<OneNoteInstall>();
            foreach (var view in new[] { RegistryView.Registry32, RegistryView.Registry64 })
            {
                foreach (var hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
                {
                    foreach (var major in new[] { 14, 15, 16 })
                    {
                        using (var baseKey = RegistryKey.OpenBaseKey(hive, view))
                        using (var key = baseKey.OpenSubKey(
                            string.Format(CultureInfo.InvariantCulture, @"Software\Microsoft\Office\{0}.0\OneNote\InstallRoot", major)))
                        {
                            var installRoot = Convert.ToString(key == null ? null : key.GetValue("Path"), CultureInfo.InvariantCulture);
                            AddInstall(result, installRoot, major, view);
                        }
                    }
                }

                using (var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
                using (var key = baseKey.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths\ONENOTE.EXE"))
                {
                    var executable = Convert.ToString(key == null ? null : key.GetValue(null), CultureInfo.InvariantCulture);
                    AddExecutable(result, executable, 16, view);
                }

                using (var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
                using (var key = baseKey.OpenSubKey(@"Software\Microsoft\Office\ClickToRun\Configuration"))
                {
                    var installationPath = Convert.ToString(key == null ? null : key.GetValue("InstallationPath"), CultureInfo.InvariantCulture);
                    if (!string.IsNullOrWhiteSpace(installationPath))
                        AddExecutable(result, Path.Combine(installationPath, "root", "Office16", "ONENOTE.EXE"), 16, view);
                }
            }

            return result
                .GroupBy(item => item.ExecutablePath, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.OrderByDescending(item => item.View == RegistryView.Registry64).First())
                .OrderBy(item => item.MajorVersion)
                .ThenBy(item => item.Architecture)
                .ToList();
        }

        private static void AddInstall(List<OneNoteInstall> installs, string installRoot, int major, RegistryView view)
        {
            if (string.IsNullOrWhiteSpace(installRoot))
                return;
            AddExecutable(installs, Path.Combine(installRoot, "ONENOTE.EXE"), major, view);
        }

        private static void AddExecutable(List<OneNoteInstall> installs, string executable, int fallbackMajor, RegistryView view)
        {
            if (string.IsNullOrWhiteSpace(executable))
                return;

            executable = Environment.ExpandEnvironmentVariables(executable.Trim().Trim('"'));
            if (!File.Exists(executable))
                return;

            var version = FileVersionInfo.GetVersionInfo(executable);
            var major = version.FileMajorPart >= 14 && version.FileMajorPart <= 16
                ? version.FileMajorPart
                : fallbackMajor;
            installs.Add(new OneNoteInstall
            {
                MajorVersion = major,
                ProductVersion = FirstNotEmpty(version.ProductVersion, version.FileVersion, major + ".0"),
                ExecutablePath = Path.GetFullPath(executable),
                View = view,
                Architecture = view == RegistryView.Registry64 ? "x64" : "x86"
            });
        }

        private static void RegisterAddIn(OneNoteInstall install, AddInVariant variant, string root)
        {
            var assemblyPath = Path.GetFullPath(Path.Combine(
                root,
                "Office" + variant.Generation,
                variant.ProgId + ".dll"));
            if (!File.Exists(assemblyPath))
                throw new FileNotFoundException("Не найдена сборка Ribbon для OneNote " + variant.Generation + ".", assemblyPath);

            var assemblyName = AssemblyName.GetAssemblyName(assemblyPath);
            var codeBase = new Uri(assemblyPath).AbsoluteUri;
            using (var localMachine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, install.View))
            {
                RegisterComClass(localMachine, @"Software\Classes", variant, assemblyName, codeBase);
                if (IsClickToRun(localMachine))
                    RegisterComClass(
                        localMachine,
                        @"Software\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Classes",
                        variant,
                        assemblyName,
                        codeBase);
                WriteAddInKey(localMachine, variant);
            }

            using (var currentUser = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, install.View))
            {
                DeleteSubKeyTree(currentUser, @"Software\Classes\" + variant.ProgId);
                DeleteSubKeyTree(currentUser, @"Software\Classes\CLSID\{" + variant.ClassId + "}");
                WriteAddInKey(currentUser, variant);
            }
        }

        private static void RegisterComClass(
            RegistryKey root,
            string classesRoot,
            AddInVariant variant,
            AssemblyName assemblyName,
            string codeBase)
        {
            var classId = "{" + variant.ClassId + "}";
            var classKeyPath = classesRoot + @"\CLSID\" + classId;
            using (var classKey = root.CreateSubKey(classKeyPath))
            {
                classKey.SetValue(null, "BibleNote OneNote Ribbon");
                classKey.SetValue("AppID", classId);
                using (var progIdKey = classKey.CreateSubKey("ProgId"))
                    progIdKey.SetValue(null, variant.ProgId);
                using (var serverKey = classKey.CreateSubKey("InprocServer32"))
                {
                    serverKey.SetValue(null, "mscoree.dll");
                    serverKey.SetValue("ThreadingModel", "Both");
                    serverKey.SetValue("Class", "BibleNote.OneNoteRibbon.RibbonAddIn");
                    serverKey.SetValue("Assembly", assemblyName.FullName);
                    serverKey.SetValue("RuntimeVersion", "v4.0.30319");
                    serverKey.SetValue("CodeBase", codeBase);
                    using (var versionKey = serverKey.CreateSubKey(assemblyName.Version.ToString()))
                    {
                        versionKey.SetValue("Class", "BibleNote.OneNoteRibbon.RibbonAddIn");
                        versionKey.SetValue("Assembly", assemblyName.FullName);
                        versionKey.SetValue("RuntimeVersion", "v4.0.30319");
                        versionKey.SetValue("CodeBase", codeBase);
                    }
                }
                classKey.CreateSubKey(@"Implemented Categories\{62C8FE65-4EBB-45E7-B440-6E39B2CDBF29}").Dispose();
            }

            using (var progIdKey = root.CreateSubKey(classesRoot + @"\" + variant.ProgId))
            {
                progIdKey.SetValue(null, "BibleNote OneNote Ribbon");
                using (var clsidKey = progIdKey.CreateSubKey("CLSID"))
                    clsidKey.SetValue(null, classId);
            }

            using (var appIdKey = root.CreateSubKey(classesRoot + @"\AppID\" + classId))
                appIdKey.SetValue("DllSurrogate", string.Empty);
        }

        private static void WriteAddInKey(RegistryKey root, AddInVariant variant)
        {
            using (var addInKey = root.CreateSubKey(@"Software\Microsoft\Office\OneNote\AddIns\" + variant.ProgId))
            {
                addInKey.SetValue("Description", "BibleNote");
                addInKey.SetValue("FriendlyName", "BibleNote");
                addInKey.SetValue("CommandLineSafe", 0, RegistryValueKind.DWord);
                addInKey.SetValue("LoadBehavior", 3, RegistryValueKind.DWord);
            }
        }

        private static bool IsClickToRun(RegistryKey localMachine)
        {
            using (var key = localMachine.OpenSubKey(@"Software\Microsoft\Office\ClickToRun\Configuration"))
                return key != null;
        }

        private static void RemoveKnownRegistrations()
        {
            foreach (var view in new[] { RegistryView.Registry32, RegistryView.Registry64 })
            {
                using (var currentUser = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, view))
                using (var localMachine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
                {
                    foreach (var variant in Variants)
                    {
                        DeleteSubKeyTree(currentUser, @"Software\Microsoft\Office\OneNote\AddIns\" + variant.ProgId);
                        DeleteSubKeyTree(currentUser, @"Software\Classes\" + variant.ProgId);
                        DeleteSubKeyTree(currentUser, @"Software\Classes\CLSID\{" + variant.ClassId + "}");
                        DeleteMachineRegistration(localMachine, @"Software\Classes", variant);
                        DeleteMachineRegistration(
                            localMachine,
                            @"Software\Microsoft\Office\ClickToRun\REGISTRY\MACHINE\Software\Classes",
                            variant);
                        DeleteSubKeyTree(localMachine, @"Software\Microsoft\Office\OneNote\AddIns\" + variant.ProgId);
                    }
                }
            }
        }

        private static void DeleteMachineRegistration(RegistryKey root, string classesRoot, AddInVariant variant)
        {
            var classId = "{" + variant.ClassId + "}";
            DeleteSubKeyTree(root, classesRoot + @"\" + variant.ProgId);
            DeleteSubKeyTree(root, classesRoot + @"\CLSID\" + classId);
            DeleteSubKeyTree(root, classesRoot + @"\AppID\" + classId);
        }

        private static void DeleteSubKeyTree(RegistryKey root, string path)
        {
            try
            {
                root.DeleteSubKeyTree(path, false);
            }
            catch (ArgumentException)
            {
            }
        }

        private static void WriteSettings(string executablePath, string controlUrl)
        {
            foreach (var view in new[] { RegistryView.Registry32, RegistryView.Registry64 })
            using (var currentUser = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, view))
            using (var key = currentUser.CreateSubKey(SettingsKey))
            {
                if (!string.IsNullOrWhiteSpace(executablePath))
                    key.SetValue("ExecutablePath", Path.GetFullPath(executablePath));
                if (!string.IsNullOrWhiteSpace(controlUrl))
                    key.SetValue("ControlUrl", controlUrl.TrimEnd('/'));
            }
        }

        private static string StatusJson(List<OneNoteInstall> installs, string root)
        {
            var statuses = installs.Select(install =>
            {
                var variant = VariantFor(install.MajorVersion);
                return new
                {
                    Install = install,
                    Variant = variant,
                    Registered = IsRegistered(install, variant)
                };
            }).ToList();
            var enabled = statuses.Count > 0 && statuses.All(status => status.Registered);
            var builder = new StringBuilder();
            builder.Append("{\"available\":true,\"platform\":\"win32\",\"enabled\":")
                .Append(enabled ? "true" : "false")
                .Append(",\"installedPrograms\":[");
            for (var index = 0; index < statuses.Count; index++)
            {
                if (index > 0)
                    builder.Append(',');
                var status = statuses[index];
                builder.Append("{\"name\":")
                    .Append(Json("Microsoft OneNote " + status.Variant.Generation))
                    .Append(",\"officeVersion\":").Append(Json(status.Install.MajorVersion + ".0"))
                    .Append(",\"productVersion\":").Append(Json(status.Install.ProductVersion))
                    .Append(",\"architecture\":").Append(Json(status.Install.Architecture))
                    .Append(",\"path\":").Append(Json(status.Install.ExecutablePath))
                    .Append(",\"ribbonRegistered\":").Append(status.Registered ? "true" : "false")
                    .Append('}');
            }
            builder.Append("],\"requiresOneNoteRestart\":true,\"ribbonRoot\":")
                .Append(Json(Path.GetFullPath(root)))
                .Append('}');
            return builder.ToString();
        }

        private static bool IsRegistered(OneNoteInstall install, AddInVariant variant)
        {
            using (var currentUser = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, install.View))
            using (var addInKey = currentUser.OpenSubKey(@"Software\Microsoft\Office\OneNote\AddIns\" + variant.ProgId))
            using (var localMachine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, install.View))
            using (var classKey = localMachine.OpenSubKey(@"Software\Classes\CLSID\{" + variant.ClassId + @"}\InprocServer32"))
            using (var appIdKey = localMachine.OpenSubKey(@"Software\Classes\AppID\{" + variant.ClassId + "}"))
            {
                if (addInKey == null || classKey == null || appIdKey == null)
                    return false;
                var loadBehavior = Convert.ToInt32(addInKey.GetValue("LoadBehavior", 0), CultureInfo.InvariantCulture);
                var codeBase = Convert.ToString(classKey.GetValue("CodeBase"), CultureInfo.InvariantCulture);
                var dllSurrogate = Convert.ToString(appIdKey.GetValue("DllSurrogate"), CultureInfo.InvariantCulture);
                Uri uri;
                return loadBehavior == 3
                    && appIdKey.GetValueNames().Contains("DllSurrogate")
                    && dllSurrogate == string.Empty
                    && Uri.TryCreate(codeBase, UriKind.Absolute, out uri)
                    && uri.IsFile
                    && File.Exists(uri.LocalPath);
            }
        }

        private static bool IsAdministrator()
        {
            using (var identity = WindowsIdentity.GetCurrent())
                return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
        }

        private static string[] WithTargetUserSid(string[] args, string targetUserSid)
        {
            if (args.Any(item => string.Equals(item, "--user-sid", StringComparison.OrdinalIgnoreCase)))
                return args;
            return args.Concat(new[] { "--user-sid", targetUserSid }).ToArray();
        }

        private static void TrustBibleProtocolForOffice(string targetUserSid)
        {
            if (string.IsNullOrWhiteSpace(targetUserSid))
                throw new InvalidOperationException("Не удалось определить профиль пользователя для настройки ссылок BibleNote.");

            using (var users = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Default))
            {
                foreach (var majorVersion in new[] { 14, 15, 16 })
                {
                    foreach (var bibleProtocol in BibleProtocols)
                    {
                        var keyPath = string.Format(
                            CultureInfo.InvariantCulture,
                            @"{0}\Software\Policies\Microsoft\Office\{1}.0\Common\Security\Trusted Protocols\All Applications\{2}",
                            targetUserSid,
                            majorVersion,
                            bibleProtocol);
                        using (var trustedProtocolKey = users.CreateSubKey(keyPath, true))
                        {
                            if (trustedProtocolKey == null)
                                throw new InvalidOperationException("Не удалось разрешить открытие ссылок BibleNote в Microsoft Office.");
                        }
                    }
                }

                foreach (var protocolClass in new[] { "bnverse", "isbtbibleverse" })
                {
                    using (var protocolKey = users.OpenSubKey(targetUserSid + @"_Classes\" + protocolClass, true))
                        if (protocolKey != null)
                            protocolKey.DeleteValue("EditFlags", false);
                }
            }
        }

        private static void RunElevated(string[] args)
        {
            var executable = Assembly.GetExecutingAssembly().Location;
            var elevatedArgs = args
                .Where(item => !string.Equals(item, "--elevated", StringComparison.OrdinalIgnoreCase))
                .Concat(new[] { "--elevated" })
                .Select(QuoteArgument);
            using (var process = Process.Start(new ProcessStartInfo
            {
                FileName = executable,
                Arguments = string.Join(" ", elevatedArgs),
                UseShellExecute = true,
                Verb = "runas",
                WindowStyle = ProcessWindowStyle.Hidden
            }))
            {
                if (process == null)
                    throw new InvalidOperationException("Не удалось запустить регистрацию с правами администратора.");
                process.WaitForExit();
                if (process.ExitCode != 0)
                    throw new InvalidOperationException("Регистрация OneNote Ribbon с правами администратора завершилась с ошибкой.");
            }
        }

        private static string QuoteArgument(string value)
        {
            return "\"" + (value ?? string.Empty).Replace("\"", "\\\"") + "\"";
        }

        private static AddInVariant VariantFor(int major)
        {
            if (major <= 14)
                return Variants[0];
            if (major == 15)
                return Variants[1];
            return Variants[2];
        }

        private static string Option(string[] args, string name)
        {
            for (var index = 0; index < args.Length - 1; index++)
                if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
                    return args[index + 1];
            return null;
        }

        private static string FirstNotEmpty(params string[] values)
        {
            return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;
        }

        private static string Json(string value)
        {
            if (value == null)
                return "null";
            return "\"" + value
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n") + "\"";
        }

        private sealed class OneNoteInstall
        {
            public int MajorVersion { get; set; }
            public string ProductVersion { get; set; }
            public string Architecture { get; set; }
            public string ExecutablePath { get; set; }
            public RegistryView View { get; set; }
        }

        private sealed class AddInVariant
        {
            public AddInVariant(int major, string generation, string progId, string classId)
            {
                Major = major;
                Generation = generation;
                ProgId = progId;
                ClassId = classId;
            }

            public int Major { get; private set; }
            public string Generation { get; private set; }
            public string ProgId { get; private set; }
            public string ClassId { get; private set; }
        }
    }
}
