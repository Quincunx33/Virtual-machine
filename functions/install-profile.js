export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const profile = formData.get('profile');

    if (!profile) {
      return new Response("No profile data provided", { status: 400 });
    }

    // Return the profile with the specific headers iOS requires
    return new Response(profile, {
      headers: {
        'Content-Type': 'application/x-apple-aspen-config',
        'Content-Disposition': 'attachment; filename="WebVM-Installer.mobileconfig"'
      }
    });
  } catch (err) {
    return new Response("Error generating profile: " + err.message, { status: 500 });
  }
}